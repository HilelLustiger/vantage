import { createHash } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Document, DocumentReview } from "@vantage/shared-types";
import { findAccountVisibleToUser } from "../shared/db/accounts.js";
import {
  findDocumentById,
  findDocumentVisibleToUser,
  findNeedsReviewDetailVisibleToUser,
  insertDocument,
  listDocumentsForUser,
} from "../shared/db/documents.js";
import { saveDocumentFile } from "../shared/storage.js";
import { applyResolutions, buildReviewLines } from "../ingest/assetReviewFlow.js";
import { transitionDocumentWithFailure } from "../ingest/documents.js";
import { ingest } from "../ingest/index.js";
import { requireAuth } from "./requireAuth.js";

const uploadDocumentSchema = z.object({
  accountId: z.string().min(1),
  dateRangeStart: z.string().date().optional(),
  dateRangeEnd: z.string().date().optional(),
});

const resolutionSchema = z.union([
  z.object({ index: z.number().int().min(0), assetId: z.string().min(1) }),
  z.object({
    index: z.number().int().min(0),
    newAsset: z.object({
      type: z.enum(["stock", "etf", "mutual_fund", "bond", "cash"]),
      name: z.string().min(1),
      ticker: z.string().min(1).optional(),
      isin: z.string().min(1).optional(),
      securityNumber: z.string().min(1).optional(),
    }),
  }),
]);
const resolveDocumentSchema = z.object({
  resolutions: z.array(resolutionSchema).min(1),
});

// PDF only — see ADR 0015. Non-PDF files are silently dropped (req.file
// stays undefined) rather than erroring, so the handler below can respond
// with a normal JSON 400 instead of multer's default error path.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

documentsRouter.post("/", upload.single("file"), async (req, res) => {
  const parsed = uploadDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }
  if (!req.file) {
    res.status(400).json({ error: "a PDF file is required" });
    return;
  }

  const account = await findAccountVisibleToUser(parsed.data.accountId, req.session.userId!);
  if (!account) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const checksum = createHash("sha256").update(req.file.buffer).digest("hex");
  const document = await insertDocument({
    accountId: parsed.data.accountId,
    checksum,
    dateRangeStart: parsed.data.dateRangeStart,
    dateRangeEnd: parsed.data.dateRangeEnd,
  });
  await saveDocumentFile(document.id, req.file.buffer);

  // Reuses #18's logic entirely — duplicate check, uploaded -> processing/duplicate.
  await ingest.startImport(document.id);

  const final = await findDocumentById(document.id);
  if (!final) {
    throw new Error(`Document ${document.id} disappeared after startImport`);
  }
  res.status(201).json(final satisfies Document);
});

documentsRouter.get("/", async (req, res) => {
  res
    .status(200)
    .json((await listDocumentsForUser(req.session.userId!)) satisfies Document[]);
});

documentsRouter.get("/:id", async (req, res) => {
  const document = await findDocumentVisibleToUser(req.params.id, req.session.userId!);
  if (!document) {
    res.status(404).json({ error: "not found" });
    return;
  }
  res.status(200).json(document satisfies Document);
});

// The #10 review flow — see ADR-0010.
documentsRouter.get("/:id/review", async (req, res) => {
  const detail = await findNeedsReviewDetailVisibleToUser(req.params.id, req.session.userId!);
  if (!detail) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const lines = buildReviewLines(detail.parsedData, detail.resolvedHoldings);
  if (!lines) {
    // Shouldn't happen — this Document already validated the same shape to
    // reach needs_review in the first place. Fail loudly rather than
    // silently returning something misleading.
    throw new Error(`Document ${req.params.id}'s parsed data no longer validates`);
  }

  res.status(200).json({ documentId: req.params.id, lines } satisfies DocumentReview);
});

documentsRouter.post("/:id/resolve", async (req, res) => {
  const parsed = resolveDocumentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid request" });
    return;
  }

  const detail = await findNeedsReviewDetailVisibleToUser(req.params.id, req.session.userId!);
  if (!detail) {
    res.status(404).json({ error: "not found" });
    return;
  }

  const result = await applyResolutions(
    req.params.id,
    detail.accountId,
    detail.parsedData,
    detail.resolvedHoldings,
    parsed.data.resolutions,
  );
  if (!result.ok) {
    if (result.kind === "invalid_request") {
      res.status(400).json({ error: result.reason });
      return;
    }
    // The batch was valid but the commit itself failed (e.g. a bad
    // statement date) — same fail-loud-into-failed convention as every
    // other pipeline step, not a bare error response.
    await transitionDocumentWithFailure(req.params.id, result.reason);
  }

  const document = await findDocumentVisibleToUser(req.params.id, req.session.userId!);
  if (!document) {
    throw new Error(`Document ${req.params.id} disappeared after resolve`);
  }
  res.status(200).json(document satisfies Document);
});

import { createHash } from "node:crypto";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import type { Document } from "@vantage/shared-types";
import { findAccountVisibleToUser } from "../shared/db/accounts.js";
import {
  findDocumentById,
  findDocumentVisibleToUser,
  insertDocument,
  listDocumentsForUser,
} from "../shared/db/documents.js";
import { saveDocumentFile } from "../shared/storage.js";
import { ingest } from "../ingest/index.js";
import { requireAuth } from "./requireAuth.js";

const uploadDocumentSchema = z.object({
  accountId: z.string().min(1),
  dateRangeStart: z.string().date().optional(),
  dateRangeEnd: z.string().date().optional(),
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

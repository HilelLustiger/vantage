import { Router, type Request, type Response } from "express";
import multer from "multer";
import type {
  DocumentReview,
  DocumentResolution,
  DocumentSummary,
  ErrorResponse,
} from "../dto/index.js";
import { listDocuments } from "../repositories/documents.js";
import { getDocumentReview, resolveDocument, uploadDocument } from "../services/documents.js";
import { requireAuth } from "./requireAuth.js";

export const documentsRouter = Router();

documentsRouter.use(requireAuth);

const upload = multer({ storage: multer.memoryStorage() });

documentsRouter.get("/", async (_req: Request, res: Response<DocumentSummary[]>) => {
  res.status(200).json(await listDocuments());
});

documentsRouter.post(
  "/",
  upload.single("file"),
  async (req: Request, res: Response<DocumentSummary | ErrorResponse>) => {
    const accountId = req.body.accountId as string | undefined;
    if (!accountId || !req.file) {
      res.status(400).json({ error: "accountId and file are required" });
      return;
    }

    try {
      const document = await uploadDocument(accountId, req.file.buffer);
      res.status(201).json(document);
    } catch (err) {
      const error: ErrorResponse = { error: err instanceof Error ? err.message : "upload failed" };
      res.status(502).json(error);
    }
  },
);

documentsRouter.get(
  "/:id/review",
  async (req: Request, res: Response<DocumentReview | ErrorResponse>) => {
    const review = await getDocumentReview(req.params.id);
    if (!review) {
      // Covers both "no such document" and "already resolved" — the
      // review page treats them identically (see notFound in
      // ReviewDocumentPage.tsx).
      res.status(404).json({ error: "not found" });
      return;
    }
    res.status(200).json(review);
  },
);

documentsRouter.post(
  "/:id/resolve",
  async (req: Request, res: Response<DocumentSummary | ErrorResponse>) => {
    const resolutions = (req.body.resolutions ?? []) as DocumentResolution[];
    try {
      const document = await resolveDocument(req.params.id, resolutions);
      res.status(200).json(document);
    } catch (err) {
      const error: ErrorResponse = { error: err instanceof Error ? err.message : "not found" };
      res.status(404).json(error);
    }
  },
);

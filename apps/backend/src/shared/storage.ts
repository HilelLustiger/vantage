import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Anchored to this module's own file location, not process.cwd() — the
// top-level test/ workspace runs vitest with cwd = test/, while apps/backend's
// own tests run with cwd = apps/backend, so a cwd-relative path would
// silently write to two different directories depending on which workspace
// ran the test.
const UPLOAD_DIR = fileURLToPath(new URL("../../data/uploads", import.meta.url));

export async function saveDocumentFile(documentId: string, file: Buffer): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
  await writeFile(path.join(UPLOAD_DIR, `${documentId}.pdf`), file);
}

export async function readDocumentFile(documentId: string): Promise<Buffer> {
  return readFile(path.join(UPLOAD_DIR, `${documentId}.pdf`));
}

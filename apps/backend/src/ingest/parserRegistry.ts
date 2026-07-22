// The generic dispatch interface from ADR-0014. The actual per-(institution,
// format) registry of parser modules lives in the Python parser service
// (M4) — see ADR-0003: adding a parser only touches that registry, not this
// service boundary. This is the stable request/response contract ingest
// builds and sends against it (M3/#22 makes the real call).
import type { Document, DocumentFormat } from "@vantage/shared-types";
import { findAccountById } from "../shared/db/accounts.js";
import { findInstitutionById } from "../shared/db/institutions.js";

export interface ParseRequest {
  institution: string;
  format: DocumentFormat;
  file: Buffer;
}

// The success payload shape is refined once #21 (Snapshot/Holding creation)
// and #24 (first concrete parser) exist to pin down what's actually needed.
export type ParseResult = { ok: true; data: unknown } | { ok: false; reason: string };

// institution is institutions.name (free text, from #13) — there's no
// stable slug today. Nothing consumes this key in anger until #24
// registers a real parser against it.
export async function resolveParserKey(
  document: Document,
): Promise<{ institution: string; format: DocumentFormat }> {
  const account = await findAccountById(document.accountId);
  if (!account) {
    throw new Error(`Account ${document.accountId} not found`);
  }
  const institution = await findInstitutionById(account.institutionId);
  if (!institution) {
    throw new Error(`Institution ${account.institutionId} not found`);
  }
  return { institution: institution.name, format: document.format };
}

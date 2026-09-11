// The one external hop ingest makes — POST /parse on the Python parser
// service, reachable only over the internal Docker network (ADR-0003). The
// real per-(institution, format) registry lives entirely on that side
// (parser/registry.py, ADR-0014); institution detection is content-based
// now, not caller-supplied (ADR-0021), so this contract is just format + file.
import type { DocumentFormat, ValidityCheckResult } from "../dto/index.js";

// A third outcome alongside ok:true/false (ADR-0026): the parser recognized
// the Document but its own completeness gate or a reconcile check flagged
// something needing a human — ok:false here too (not a clean success), but
// distinguished by needsReview so the caller can route it to
// transitionDocumentToNeedsReviewForValidityFailure instead of a terminal
// failure.
export type ParseResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: string }
  | { ok: false; needsReview: true; values: unknown; failedChecks: ValidityCheckResult[] };

export async function parseDocument(file: Buffer, format: DocumentFormat): Promise<ParseResult> {
  const body = new FormData();
  body.set("format", format);
  body.set("file", new Blob([file]), "document.pdf");

  // A network-level failure to even reach the parser service (down,
  // unreachable, non-2xx) is just as much a "failed" outcome as the
  // service's own ok:false — resolve to one here rather than letting the
  // caller deal with a rejected promise on top of a ParseResult union.
  try {
    const response = await fetch(`${process.env.PARSER_URL}/parse`, {
      method: "POST",
      body,
    });
    if (!response.ok) {
      return { ok: false, reason: `parser service returned HTTP ${response.status}` };
    }
    return (await response.json()) as ParseResult;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `could not reach parser service: ${message}` };
  }
}

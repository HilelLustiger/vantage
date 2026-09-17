import { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { Card } from "./Card";
import { documentsApi } from "../api/documents";

// The left half of the extraction_review dual-pane shape (ADR-0008):
// the real source PDF, for visual context while resolving each extracted
// line — ExtractedLine carries no bbox (unlike content_review's DocumentLine),
// so this renders the page only, with no per-line overlay.
export function DocumentPreviewPane({ documentId }: { documentId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const buffer = await documentsApi.file(documentId);
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) return;
        await page.render({ canvas, canvasContext: context, viewport }).promise;
      } catch {
        if (!cancelled) setRenderError("Couldn't load a preview of this document.");
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <Card className="flex w-[42%] shrink-0 flex-col overflow-y-auto p-4">
      <p className="mb-2.5 px-1 text-sm font-medium text-gray-500">Original document</p>
      {renderError ? (
        <p className="p-4 text-sm text-red-600">{renderError}</p>
      ) : (
        <canvas ref={canvasRef} className="block h-auto w-full rounded-lg" />
      )}
    </Card>
  );
}

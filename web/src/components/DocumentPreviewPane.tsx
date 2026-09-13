import { Card } from "./Card";

// The left half of the review flow's dual-pane shape (ADR-0008): "All three
// [NeedsReview reasons] converge on one manual-correction screen shape
// (dual-pane: original document preview alongside an editable form)." No
// real PDF rendering yet — a generic document skeleton, with an optional
// highlighted region for whichever part of the statement the right-hand
// form is asking the user to fill in or correct.
export function DocumentPreviewPane({ highlightNote }: { highlightNote?: string }) {
  return (
    <Card className="flex w-[42%] shrink-0 flex-col p-4">
      <p className="mb-2.5 px-1 text-sm font-medium text-gray-500">Original document</p>
      <div className="flex-1 overflow-hidden rounded-lg bg-gray-100 p-7">
        <div className="h-full rounded bg-white p-6 shadow-sm">
          <div className="mb-2 h-3.5 w-[55%] rounded bg-gray-200" />
          <div className="mb-6 h-2.5 w-[35%] rounded bg-gray-200" />
          <div className="mb-1.5 h-2 w-[80%] rounded bg-gray-100" />
          <div className="mb-1.5 h-2 w-[70%] rounded bg-gray-100" />
          <div className="mb-6 h-2 w-[75%] rounded bg-gray-100" />

          {highlightNote && (
            <div className="relative rounded-md border-[1.5px] border-dashed border-amber-400 p-3.5">
              <span className="absolute -top-2.5 left-3 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                {highlightNote}
              </span>
              <div className="mb-2 mt-1.5 h-2 w-[90%] rounded bg-amber-200/50" />
              <div className="mb-2 h-2 w-[85%] rounded bg-amber-200/50" />
              <div className="mb-2 h-2 w-[88%] rounded bg-amber-200/50" />
              <div className="h-2 w-[80%] rounded bg-amber-200/50" />
            </div>
          )}

          <div className="mt-5 h-2 w-[60%] rounded bg-gray-100" />
        </div>
      </div>
    </Card>
  );
}

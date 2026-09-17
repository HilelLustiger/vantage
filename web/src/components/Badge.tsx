import type { ReactNode } from "react";

// Color is a full override, not appended — bg-gray-100/text-gray-700 below
// are only a fallback for when the caller doesn't pass one. Two color
// classNames concatenated together would both land in the DOM, and which
// one visually wins would depend on Tailwind's generated CSS order, not
// className concatenation order.
export function Badge({
  children,
  className = "bg-gray-100 text-gray-700",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${className}`}
    >
      {children}
    </span>
  );
}

import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary";

const variantClasses: Record<Variant, string> = {
  primary: "bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50",
  secondary:
    "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 disabled:opacity-50",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium ${variantClasses[variant]} ${className}`}
      {...props}
    />
  );
}

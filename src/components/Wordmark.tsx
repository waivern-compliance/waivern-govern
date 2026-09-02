import { PRODUCT_SUFFIX, PRODUCT_VENDOR } from "@/lib/product";

/**
 * The Waivern mark, inline.
 *
 * Inline rather than an `<img>` so it inherits `currentColor` — the same mark
 * serves a navy masthead in white and a light page in navy, without a second
 * asset that can drift from the first. `public/waivern-mark.svg` holds the
 * same geometry for anything that needs a file.
 */
export function Mark({ className = "h-6 w-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className={className}>
      <g fill="none" stroke="currentColor" strokeWidth={2.4}>
        <path d="M20 29 V41" />
        <path d="M26.36 56.36 L43.64 73.64" />
        <path d="M59 80 H71" />
        <path d="M56.36 43.64 L73.64 26.36" />
        <circle cx="20" cy="20" r="7.8" />
        <circle cx="50" cy="20" r="7.8" />
        <circle cx="80" cy="20" r="7.8" />
        <circle cx="20" cy="50" r="7.8" />
        <circle cx="50" cy="50" r="7.8" />
        <circle cx="80" cy="50" r="7.8" />
        <circle cx="20" cy="80" r="7.8" />
        <circle cx="50" cy="80" r="7.8" />
        <circle cx="80" cy="80" r="7.8" />
      </g>
    </svg>
  );
}

/** Mark and name together, for a masthead or a sign-in page. */
export function Wordmark({
  size = "small",
}: {
  size?: "small" | "large";
}) {
  const large = size === "large";
  return (
    <span className={`flex items-center ${large ? "gap-3" : "gap-2.5"}`}>
      <Mark className={large ? "h-10 w-10" : "h-6 w-6"} />
      <span className={large ? "text-xl font-semibold tracking-tight" : "text-sm font-semibold tracking-tight"}>
        {PRODUCT_VENDOR}{" "}
        <span className="font-normal opacity-70">{PRODUCT_SUFFIX}</span>
      </span>
    </span>
  );
}

/**
 * Receipts' logo in Remora's style (ADR-0066, after Remora's components/logo.tsx): a white receipt
 * on a rounded indigo tile, with the lowercase word beside it. One path in `currentColor`, so the
 * colours come from tokens. `public/favicon.svg` draws the same receipt.
 */
import { cn } from "cn";

/** A receipt with a torn bottom edge and three printed lines (cut out, so the tile shows through). */
export const RECEIPT_PATH =
  "M5 2.5h14v19l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5zM8 7v1.8h8V7zm0 4v1.8h8V11zm0 4v1.8h5V15z";

/** The tile's corners follow app icons, like Remora's. */
const TILE_RADIUS = 0.24;
const WORD_TO_MARK = 0.78;

export function Logo({
  size = 28,
  withText = false,
  className,
}: {
  size?: number;
  withText?: boolean;
  className?: string;
}) {
  const glyph = Math.round(size * 0.68);
  return (
    <span
      data-slot="logo"
      role="img"
      aria-label="Receipts"
      className={cn("inline-flex items-center", className)}
      style={{ gap: Math.round(size * 0.3) }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center bg-primary text-primary-foreground"
        style={{ width: size, height: size, borderRadius: size * TILE_RADIUS }}
      >
        <svg viewBox="0 0 24 24" width={glyph} height={glyph} aria-hidden focusable="false">
          <path fill="currentColor" fillRule="evenodd" d={RECEIPT_PATH} />
        </svg>
      </span>
      {withText ? (
        <span
          aria-hidden
          className="font-semibold tracking-tight text-foreground"
          style={{ fontSize: Math.round(size * WORD_TO_MARK), lineHeight: 1 }}
        >
          receipts
        </span>
      ) : null}
    </span>
  );
}

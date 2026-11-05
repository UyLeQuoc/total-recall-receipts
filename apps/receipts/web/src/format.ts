export const pct = (p: number) => `${Math.round(p * 100)}%`;

export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;

export const sameAddress = (a: string | null | undefined, b: string | null | undefined) =>
  !!a && !!b && a.toLowerCase() === b.toLowerCase();

/** "Sat 25 Oct, 22:00" in the reader's own time zone. */
export function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "in 3h 20m", "in 12m", "in 4 days". */
export function until(iso: string, now = Date.now()): string {
  const ms = Date.parse(iso) - now;
  if (ms <= 0) return "locked";
  const m = Math.round(ms / 60_000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `in ${h}h ${m % 60}m`;
  return `in ${Math.round(h / 24)} days`;
}

/** "22:00" in the reader's own time zone. */
export function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** "Today", "Tomorrow", or "Sat, Nov 7" in the reader's own time zone. */
export function dayLabel(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = new Date(at.getFullYear(), at.getMonth(), at.getDate());
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return at.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** Sooner than three hours away, and not yet locked: the only countdown that turns amber. */
export function urgent(iso: string, now = Date.now()): boolean {
  const ms = Date.parse(iso) - now;
  return ms > 0 && ms < 3 * 3_600_000;
}

export function ago(iso: string, now = Date.now()): string {
  const m = Math.round((now - Date.parse(iso)) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)} days ago`;
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

/** Third-party JSON with a deadline. Sources are keyless and public (ADR-0061). */
export async function getJson<T>(
  url: string,
  fetchFn: Fetch = fetch,
  timeoutMs = 20_000,
): Promise<T> {
  const res = await fetchFn(url, {
    headers: { accept: "application/json", "user-agent": "receipts/0.1 (+hackathon)" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`);
  return (await res.json()) as T;
}

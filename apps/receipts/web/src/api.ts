/**
 * The Receipts API as the web sees it (ADR-0064). Types are the web's own copy, so the web never
 * pulls server code into the browser bundle; only the signed-message text is shared.
 */

export interface Member {
  id: string;
  name: string;
  label: string;
  test: boolean;
  address: string | null;
  telegram: boolean;
}

export interface GroupSummary {
  id: string;
  name: string;
  telegram: boolean;
  createdAt: string;
  members: number;
}

export interface Group {
  id: string;
  name: string;
  telegram: boolean;
  createdAt: string;
  members: Member[];
}

export interface BoardEvent {
  id: string;
  league: string;
  kind: string;
  title: string;
  yesLabel: string;
  noLabel: string;
  startsAt: string;
  voices: { voice: string; label: string; prob: number; member: boolean }[];
  picks: {
    id: string;
    memberId: string;
    side: "yes" | "no";
    confidence: number;
    signed: boolean;
  }[];
}

export interface Chip {
  text: string;
  blobId?: string;
  memoryId?: string;
}

export interface Call {
  eventId: string;
  prob: number | null;
  average: number | null;
  weights: Record<string, number>;
  source: { blobId: string; asOf: string } | null;
  chips: Chip[];
}

export interface RecentPick {
  id: string;
  eventId: string;
  title: string;
  league: string;
  memberId: string;
  member: string;
  side: "yes" | "no";
  sideLabel: string;
  confidence: number;
  createdAt: string;
  anchored: boolean;
  signed: boolean;
  result: boolean | null;
}

export interface PickLeaf {
  id: string;
  groupId: string;
  memberId: string;
  eventId: string;
  side: string;
  confidence: number;
  createdAt: string;
  signer?: string;
  signature?: string;
}

export interface Receipt {
  pick: PickLeaf;
  leaf: string;
  proof: { sibling: string; left: boolean }[];
  anchor: { digest: string; root: string; network: string } | null;
  event: { id: string; title: string; locksAt: string };
  signedMessage?: string;
}

export interface PickPage {
  receipt: Receipt;
  group: { id: string; name: string } | null;
  member: Member | null;
  event: {
    id: string;
    league: string;
    title: string;
    yesLabel: string;
    noLabel: string;
    startsAt: string;
    status: string;
    outcome: number | null;
    detail: string | null;
  } | null;
  sideLabel: string;
  explorer: string | null;
}

export interface Verification {
  ok: boolean;
  signed: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
}

export interface VoiceScore {
  voice: string;
  label: string;
  league: string;
  n: number;
  hits: number;
  brier: number;
  shrunk: number;
}

export interface LeagueScores {
  league: string;
  voices: VoiceScore[];
  calibration: { from: number; n: number; hits: number }[];
}

export interface CurvePoint {
  eventId: string;
  at: string;
  n: number;
  weighted: number;
  average: number;
  books: number | null;
}

export interface LeagueLearning {
  league: string;
  backfilled: number;
  curve: CurvePoint[];
}

export interface MemoryRow {
  id: string;
  namespace: string;
  kind: string;
  text: string;
  blobId: string | null;
  status: string;
  createdAt: string;
}

export interface PickResult {
  pick: { id: string };
  nudge: Chip | null;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    ...(body === undefined
      ? {}
      : {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data.error ?? "error",
      data.message ?? data.error ?? `Request failed (${res.status})`,
    );
  }
  return data as T;
}

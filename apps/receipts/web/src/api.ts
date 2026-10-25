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
  /** An agent (ADR-0066): the member it picks for. */
  agentOf?: string | null;
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
  voices: { voice: string; label: string; prob: number; member: boolean; agent?: boolean }[];
  picks: {
    id: string;
    memberId: string;
    side: "yes" | "no";
    confidence: number;
    signed: boolean;
    agent?: boolean;
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
  agent?: boolean;
  reason?: string | null;
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
  /** An agent's pick (v3): the owner's delegation. */
  delegationId?: string;
}

export interface ReceiptDelegation {
  id: string;
  owner: string;
  agent: string;
  until: string;
  message: string;
  signature: string;
  revokedAt?: string;
  revokeMessage?: string;
  revokeSignature?: string;
}

export interface Receipt {
  pick: PickLeaf;
  leaf: string;
  proof: { sibling: string; left: boolean }[];
  anchor: { digest: string; root: string; network: string } | null;
  event: { id: string; title: string; locksAt: string };
  signedMessage?: string;
  delegation?: ReceiptDelegation;
}

export interface PickPage {
  receipt: Receipt;
  group: { id: string; name: string } | null;
  member: Member | null;
  /** For an agent's pick: the member it picked for, and its one-line reason. */
  owner?: Member | null;
  reason?: string | null;
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

export interface Delegation {
  id: string;
  agent: string;
  agentName: string;
  agentMemberId: string;
  owner: string;
  ownerName: string;
  until: string;
  createdAt: string;
  revokedAt: string | null;
  live: boolean;
  message: string;
  picks: number;
  record: { league: string; n: number; hits: number; brier: number; shrunk: number }[];
}

export interface McpToken {
  id: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  calls: number;
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

import { useCurrentAccount } from "@mysten/dapp-kit";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type BoardEvent,
  type Call,
  type Group,
  type GroupSummary,
  type LeagueLearning,
  type LeagueScores,
  type MemoryRow,
  type PickPage,
  type RecentPick,
  type Verification,
} from "./api.ts";
import { sameAddress } from "./format.ts";

export const keys = {
  groups: ["groups"],
  group: (id: string) => ["group", id],
  board: (id: string) => ["board", id],
  picks: (id: string) => ["picks", id],
};

export const useGroups = () =>
  useQuery({ queryKey: keys.groups, queryFn: () => api<GroupSummary[]>("/api/groups") });

export const useGroup = (id: string) =>
  useQuery({ queryKey: keys.group(id), queryFn: () => api<Group>(`/api/groups/${id}`) });

export const useBoard = (id: string) =>
  useQuery({
    queryKey: keys.board(id),
    queryFn: () => api<BoardEvent[]>(`/api/groups/${id}/board`),
    refetchInterval: 60_000,
  });

/** Receipts' call recalls trust snapshots from Walrus Memory, so it loads after the board. */
export const useCall = (groupId: string, eventId: string) =>
  useQuery({
    queryKey: ["call", groupId, eventId],
    queryFn: () => api<Call>(`/api/groups/${groupId}/calls/${encodeURIComponent(eventId)}`),
    staleTime: 60_000,
    retry: false,
  });

export const usePicks = (id: string) =>
  useQuery({
    queryKey: keys.picks(id),
    queryFn: () => api<RecentPick[]>(`/api/groups/${id}/picks`),
  });

export const useScores = (id: string) =>
  useQuery({
    queryKey: ["scores", id],
    queryFn: () => api<LeagueScores[]>(`/api/groups/${id}/scores`),
  });

export const useLearning = (id: string) =>
  useQuery({
    queryKey: ["learning", id],
    queryFn: () => api<LeagueLearning[]>(`/api/groups/${id}/learning`),
  });

export const useMemories = (id: string) =>
  useQuery({
    queryKey: ["memories", id],
    queryFn: () => api<MemoryRow[]>(`/api/groups/${id}/memories`),
  });

export const usePick = (id: string) =>
  useQuery({ queryKey: ["pick", id], queryFn: () => api<PickPage>(`/api/picks/${id}`) });

export const useVerify = (id: string) =>
  useQuery({
    queryKey: ["verify", id],
    queryFn: () => api<Verification>(`/api/picks/${id}/verify`),
    staleTime: 30_000,
  });

/** The connected wallet's member in this group, if it has joined. */
export function useMe(group: Group | undefined) {
  const account = useCurrentAccount();
  const me = group?.members.find((m) => sameAddress(m.address, account?.address));
  return { account, me };
}

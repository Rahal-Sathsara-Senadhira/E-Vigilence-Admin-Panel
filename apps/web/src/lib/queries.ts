import type { AuditChainStatus, AuditEntryView, Paged, StaffUserView } from "@ev/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "./api";

export interface StationView {
  id: string;
  name: string;
  divisionId: string | null;
  divisionName: string | null;
  isActive: boolean;
  verified: boolean;
}

export interface UsersFilter {
  q?: string;
  role?: string;
  active?: string;
  page: number;
}

export const useUsers = (filter: UsersFilter) =>
  useQuery({
    queryKey: ["users", filter],
    queryFn: () => api<Paged<StaffUserView>>("/users", { query: { ...filter, pageSize: 25 } }),
    placeholderData: keepPreviousData,
  });

export const useStations = (q?: string) =>
  useQuery({
    queryKey: ["stations", q ?? ""],
    queryFn: () => api<StationView[]>("/stations", { query: { q } }),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

export const useAudit = (page: number, action?: string) =>
  useQuery({
    queryKey: ["audit", page, action ?? ""],
    queryFn: () => api<Paged<AuditEntryView>>("/audit", { query: { page, pageSize: 50, action } }),
    placeholderData: keepPreviousData,
  });

export const useSystemHealth = () =>
  useQuery({
    queryKey: ["system-health"],
    queryFn: () =>
      api<{
        uptimeSeconds: number;
        node: string;
        memoryMb: number;
        database: { state: string; name: string };
        auditChain: AuditChainStatus | null;
      }>("/system/health"),
    refetchInterval: 30_000,
  });

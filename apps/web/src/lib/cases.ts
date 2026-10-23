import type {
  CaseDetail,
  CaseListItem,
  CaseView,
  EvidenceView,
  Paged,
  PersonView,
  StaffUserView,
  VehicleView,
} from "@ev/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";

export const useCases = (filter: { view: CaseView; q?: string; page: number }) =>
  useQuery({
    queryKey: ["cases", filter],
    queryFn: () => api<Paged<CaseListItem>>("/cases", { query: { ...filter, pageSize: 25 } }),
    placeholderData: keepPreviousData,
  });

export const useCase = (id: string) =>
  useQuery({ queryKey: ["case", id], queryFn: () => api<CaseDetail>(`/cases/${id}`) });

export const useCaseEvidence = (id: string) =>
  useQuery({
    queryKey: ["case-evidence", id],
    queryFn: () => api<EvidenceView[]>(`/cases/${id}/evidence`),
    refetchInterval: (q) => (q.state.data?.some((e) => e.status === "processing") ? 5_000 : false),
  });

export const usePerson = (id: string) =>
  useQuery({ queryKey: ["person", id], queryFn: () => api<PersonView>(`/persons/${id}`) });
export const useVehicle = (id: string) =>
  useQuery({ queryKey: ["vehicle", id], queryFn: () => api<VehicleView>(`/vehicles/${id}`) });

/** Officers at a station, for assigning the investigating officer. */
export const useStationOfficers = (stationId: string | null, enabled: boolean) =>
  useQuery({
    queryKey: ["station-officers", stationId],
    queryFn: () =>
      api<Paged<StaffUserView>>("/users", {
        query: { stationId: stationId ?? undefined, active: "true", pageSize: 100 },
      }),
    enabled: enabled && !!stationId,
    select: (d) => d.items.filter((u) => u.role === "station_officer" || u.role === "station_oic"),
  });

/** Posts one case action and refreshes the case. */
export function useCaseAction(id: string, onDone?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      body,
      method = "POST",
    }: {
      path: string;
      body?: unknown;
      method?: "POST" | "PUT" | "PATCH";
    }) => api<{ summary: string }>(`/cases/${id}/${path}`, { method, body: body ?? {} }),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["case", id] });
      void queryClient.invalidateQueries({ queryKey: ["case-evidence", id] });
      void queryClient.invalidateQueries({ queryKey: ["cases"] });
      toast.success(res.summary);
      onDone?.();
    },
  });
}

// Management reports — server state (docs/12 §7).

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiBlob } from "@/lib/api.js";

/**
 * @typedef {object} ReportRun
 * @property {string} id
 * @property {string} type
 * @property {string} title
 * @property {string} periodLabel
 * @property {{ kind: "national" | "division" | "station", label: string }} scope
 * @property {"scheduled" | "on_demand"} trigger
 * @property {string | null} requestedBy
 * @property {"done" | "failed"} status
 * @property {string | null} error
 * @property {{ pdf: { size: number, sha256: string } | null, csv: { size: number, sha256: string } | null }} files
 * @property {string} createdAt
 */
/** @typedef {{ key: string, title: string, summary: string, schedule: "daily" | "weekly" | "monthly" | null, level: "national" | "any" }} ReportType */

/** @param {{ type?: string, page: number }} filters */
export const useReportRuns = (filters) =>
  useQuery({
    queryKey: ["management-reports", filters],
    queryFn: () =>
      /** @type {Promise<{ types: ReportType[], canRequest: boolean, items: ReportRun[], total: number, page: number, pageSize: number }>} */ (
        api("/management-reports", { query: filters })
      ),
    placeholderData: keepPreviousData,
  });

export function useRequestReport() {
  const qc = useQueryClient();
  return useMutation({
    /** @param {Record<string, string | undefined>} body */
    mutationFn: (body) =>
      /** @type {Promise<ReportRun>} */ (api("/management-reports", { method: "POST", body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["management-reports"] }),
  });
}

/**
 * Downloads a run's file with the access token, saved under its name.
 * @param {ReportRun} run @param {"pdf" | "csv"} format
 */
export async function downloadRun(run, format) {
  const blob = await apiBlob(`/management-reports/runs/${run.id}/${format}`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${run.type.replaceAll("_", "-")}-${run.createdAt.slice(0, 10)}.${format}`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// The filter row (docs/12 §5): period (with a custom range), and for HQ the
// division and station; channel and priority. Kept in the URL.

import { Input, Select } from "@/ui/index.js";
import { useDivisionStations, useDivisions } from "../api.js";

const PERIODS = [
  ["today", "Today"],
  ["7d", "Last 7 days"],
  ["30d", "Last 30 days"],
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["custom", "Custom range"],
];

/**
 * @param {{
 *   value: Record<string, string | undefined>,
 *   onChange: (next: Record<string, string | undefined>) => void,
 *   places: boolean,
 *   reports: boolean,
 * }} props
 */
export function Filters({ value, onChange, places, reports }) {
  const divisions = useDivisions();
  const stations = useDivisionStations(places ? value.divisionId : undefined);
  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select
        aria-label="Period"
        className="w-40"
        value={value.period ?? "30d"}
        onChange={(e) => onChange({ period: e.target.value })}
      >
        {PERIODS.map(([k, l]) => (
          <option key={k} value={k}>
            {l}
          </option>
        ))}
      </Select>
      {value.period === "custom" ? (
        <>
          <Input
            type="date"
            aria-label="From"
            className="w-40"
            value={value.from ?? ""}
            onChange={(e) => onChange({ from: e.target.value || undefined })}
          />
          <Input
            type="date"
            aria-label="To"
            className="w-40"
            value={value.to ?? ""}
            onChange={(e) => onChange({ to: e.target.value || undefined })}
          />
        </>
      ) : null}
      {places ? (
        <>
          <Select
            aria-label="Division"
            className="w-44"
            value={value.divisionId ?? ""}
            onChange={(e) =>
              onChange({ divisionId: e.target.value || undefined, stationId: undefined })
            }
          >
            <option value="">All divisions</option>
            {(divisions.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
          {value.divisionId ? (
            <Select
              aria-label="Station"
              className="w-52"
              value={value.stationId ?? ""}
              onChange={(e) => onChange({ stationId: e.target.value || undefined })}
            >
              <option value="">All stations in the division</option>
              {(stations.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : null}
        </>
      ) : null}
      {reports ? (
        <Select
          aria-label="Channel"
          className="w-44"
          value={value.channel ?? ""}
          onChange={(e) => onChange({ channel: e.target.value || undefined })}
        >
          <option value="">All channels</option>
          <option value="app">Mobile app</option>
          <option value="walk_in">Walk-in</option>
          <option value="hotline">Hotline / WhatsApp</option>
          <option value="other">Officer</option>
        </Select>
      ) : null}
      <Select
        aria-label="Priority"
        className="w-36"
        value={value.priority ?? ""}
        onChange={(e) => onChange({ priority: e.target.value || undefined })}
      >
        <option value="">All priorities</option>
        <option value="P1">P1</option>
        <option value="P2">P2</option>
        <option value="P3">P3</option>
      </Select>
    </div>
  );
}

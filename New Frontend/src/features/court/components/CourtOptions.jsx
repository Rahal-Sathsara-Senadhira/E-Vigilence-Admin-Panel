// The active courts as <option>s grouped by district, for a court picker.

import { byDistrict } from "../lib/courts.js";

/** @param {{ courts: import("../api.js").CourtRow[] | undefined }} props */
export function CourtOptions({ courts }) {
  return byDistrict((courts ?? []).filter((c) => c.isActive)).map(([district, list]) => (
    <optgroup key={district} label={district}>
      {list.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </optgroup>
  ));
}

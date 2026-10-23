// Response shapes for divisions and stations.

/** @param {any} d @param {{ stations: number, verified: number }} [counts] */
export const divisionView = (d, counts) => ({
  id: String(d._id),
  name: d.name,
  code: d.code,
  range: d.range ?? null,
  province: d.province ?? null,
  isActive: d.isActive !== false,
  stations: counts?.stations ?? 0,
  verifiedStations: counts?.verified ?? 0,
});

/** @param {any} s */
const latLng = (s) =>
  s.location?.coordinates
    ? { lat: s.location.coordinates[1], lng: s.location.coordinates[0] }
    : null;

/** @param {any} s */
const statusOf = (s) => (!s.isActive ? "inactive" : s.verified ? "verified" : "unverified");

/**
 * A row in the stations list.
 * @param {any} s @param {Map<string, string>} divisionNames
 */
export const stationListView = (s, divisionNames) => ({
  id: String(s._id),
  name: s.name,
  code: s.code,
  division: s.divisionId
    ? { id: String(s.divisionId), name: divisionNames.get(String(s.divisionId)) ?? "—" }
    : null,
  suggestedDivision:
    !s.divisionId && s.suggestedDivisionId
      ? {
          id: String(s.suggestedDivisionId),
          name: divisionNames.get(String(s.suggestedDivisionId)) ?? "—",
        }
      : null,
  location: latLng(s),
  hasArea: Boolean(s.area),
  phone: s.phone ?? null,
  status: statusOf(s),
});

/**
 * One station in full.
 * @param {any} s
 * @param {{ divisionNames: Map<string, string>, staff: { role: string, count: number }[], verifiedByName: string | null }} extra
 * @param {{ edit: boolean, editContact: boolean, verify: boolean, editArea: boolean, deactivate: boolean, reactivate: boolean }} can
 */
export const stationView = (s, extra, can) => ({
  ...stationListView(s, extra.divisionNames),
  address: s.address ?? null,
  email: s.email ?? null,
  area: s.area ?? null,
  source: s.source,
  osmId: s.osmId ?? null,
  verifiedAt: s.verifiedAt ? new Date(s.verifiedAt).toISOString() : null,
  verifiedBy: extra.verifiedByName,
  staff: extra.staff,
  can,
});

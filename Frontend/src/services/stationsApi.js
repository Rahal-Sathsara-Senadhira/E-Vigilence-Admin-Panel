import { api } from "./api";

// Backend/src/modules/policeStations — the one stations API — and
// Backend/src/modules/divisions (territorial divisions, HQ only).
const S = "/api/police-stations";

const qs = (params) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) if (v !== undefined && v !== null && v !== "") p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
};

export const listStations = (params = {}) => api.get(`${S}${qs(params)}`);
export const getStation = (id) => api.get(`${S}/${id}`);
export const getStationOfficers = (id) => api.get(`${S}/${id}/officers`);
export const getStationAudit = (id) => api.get(`${S}/${id}/audit`);
export const getVerificationQueue = () => api.get(`${S}/verification-queue`);

export const createStation = (body) => api.post(S, body);
export const updateStation = (id, body) => api.patch(`${S}/${id}`, body);
export const verifyStation = (id, body) => api.post(`${S}/${id}/verify`, body);
// geometry = GeoJSON Polygon/MultiPolygon ([lng, lat]), or null to clear.
export const setStationJurisdiction = (id, geometry) => api.put(`${S}/${id}/jurisdiction`, { geometry });
export const getDeactivationPlan = (id) => api.get(`${S}/${id}/deactivation-plan`);
export const deactivateStation = (id, body) => api.post(`${S}/${id}/deactivate`, body);
export const reactivateStation = (id) => api.post(`${S}/${id}/reactivate`, {});
export const deleteStation = (id) => api.del(`${S}/${id}`);
export const importStations = (rows) => api.post(`${S}/import`, { rows });

export const listDivisions = () => api.get("/api/divisions");
export const getDivision = (id) => api.get(`/api/divisions/${id}`);
export const createDivision = (body) => api.post("/api/divisions", body);
export const updateDivision = (id, body) => api.patch(`/api/divisions/${id}`, body);

// Station-side dispatch actions (Assigned Violations page).
export const acceptCase = (violationId) => api.post(`/api/violations/${violationId}/receive`, {});
export const returnCase = (violationId, reason) => api.post(`/api/violations/${violationId}/return`, { reason });

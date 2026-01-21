import { api } from "./api";

export function listRegionalStations() {
  return api.get("/api/regional-stations");
}

export function createRegionalStation(payload) {
  return api.post("/api/regional-stations", payload);
}

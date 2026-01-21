import { api } from "./api";

export const getSettings = () => api.get("/api/settings");
export const updateSettings = (p) => api.patch("/api/settings", p);

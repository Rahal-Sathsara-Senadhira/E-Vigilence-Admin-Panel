import { api } from "./api";

export const getDashboardSummary = () => api.get("/api/dashboard/summary");

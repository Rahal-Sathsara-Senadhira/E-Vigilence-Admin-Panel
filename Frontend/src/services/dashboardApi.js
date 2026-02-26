// src/services/dashboardApi.js
import { api } from "./api";

/**
 * Backend route:
 * GET /api/dashboard?days=14
 */
export async function getDashboardSummary(days = 14) {
  return api.get(`/api/dashboard?days=${days}`);
}
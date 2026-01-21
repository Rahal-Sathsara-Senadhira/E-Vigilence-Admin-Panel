import { api } from "./api";

export const listUsers = () => api.get("/api/users");
export const createUser = (p) => api.post("/api/users", p);
export const updateUser = (id, p) => api.patch(`/api/users/${id}`, p);

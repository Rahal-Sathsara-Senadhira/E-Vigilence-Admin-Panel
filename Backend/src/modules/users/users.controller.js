import * as service from "./users.service.js";

export async function listUsers(req, res, next) {
  try {
    const data = await service.listUsers(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function getUserById(req, res, next) {
  try {
    const data = await service.getUserById(req.params.id);
    if (!data) return res.status(404).json({ message: "User not found" });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function createUser(req, res, next) {
  try {
    const created = await service.createUser(req.body);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req, res, next) {
  try {
    const updated = await service.updateUser(req.params.id, req.body);
    if (!updated) return res.status(404).json({ message: "User not found" });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req, res, next) {
  try {
    const ok = await service.deleteUser(req.params.id);
    if (!ok) return res.status(404).json({ message: "User not found" });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
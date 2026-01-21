import {
  createUserSchema,
  updateUserSchema,
} from "./users.validation.js";
import {
  createUser,
  listUsers,
  updateUser,
} from "./users.service.js";

export async function createUserHandler(req, res, next) {
  try {
    const data = createUserSchema.parse(req.body);
    const user = await createUser(data);
    res.status(201).json({ data: user });
  } catch (e) {
    next(e);
  }
}

export async function listUsersHandler(req, res, next) {
  try {
    const users = await listUsers();
    res.json({ data: users });
  } catch (e) {
    next(e);
  }
}

export async function updateUserHandler(req, res, next) {
  try {
    const patch = updateUserSchema.parse(req.body);
    const user = await updateUser(req.params.id, patch);
    res.json({ data: user });
  } catch (e) {
    next(e);
  }
}

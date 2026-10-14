import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../auth/middleware.js";
import { notFound } from "../errors.js";
import { ROLES, User } from "./model.js";

export const usersRouter = Router();
usersRouter.use(requireAuth, requireRole("admin"));

usersRouter.get("/", async (_req, res) => {
  const users = await User.find({}, { passwordHash: 0 }).sort({ createdAt: 1 }).lean();
  res.json(users.map(({ _id, email, name, role }) => ({ id: _id, email, name, role })));
});

usersRouter.patch("/:id/role", async (req, res) => {
  const { role } = z.object({ role: z.enum(ROLES) }).parse(req.body);
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { returnDocument: "after" });
  if (!user) throw notFound("User");
  res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

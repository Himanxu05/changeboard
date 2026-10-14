import bcrypt from "bcryptjs";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { HttpError } from "../errors.js";
import { User } from "../users/model.js";
import { currentUser, requireAuth } from "./middleware.js";
import { signToken } from "./tokens.js";

const credentials = z.object({
  email: z.email(),
  password: z.string().min(8).max(128),
});
const registration = credentials.extend({ name: z.string().trim().min(1).max(100) });

// Slow down password guessing: 20 attempts per IP per 15 minutes.
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const body = registration.parse(req.body);
  if (await User.exists({ email: body.email })) throw new HttpError(409, "Email already registered");
  // Self-registration always creates a requester; only an admin can grant other roles.
  const user = await User.create({
    email: body.email,
    name: body.name,
    passwordHash: await bcrypt.hash(body.password, 10),
  });
  res.status(201).json({ id: user.id, email: user.email, name: user.name, role: user.role });
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const body = credentials.parse(req.body);
  const user = await User.findOne({ email: body.email });
  // Same message for unknown email and wrong password, so the endpoint
  // doesn't reveal which emails have accounts.
  if (!user || !(await bcrypt.compare(body.password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }
  const authUser = { id: user.id as string, role: user.role, name: user.name };
  res.json({ token: signToken(authUser), user: authUser });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json(currentUser(req));
});

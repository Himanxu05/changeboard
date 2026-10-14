import type { RequestHandler } from "express";
import { HttpError } from "../errors.js";
import type { Role } from "../users/model.js";
import { verifyToken, type AuthUser } from "./tokens.js";

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) throw new HttpError(401, "Missing bearer token");
  try {
    req.user = verifyToken(token);
  } catch {
    throw new HttpError(401, "Invalid or expired token");
  }
  next();
};

export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, "Insufficient role");
    }
    next();
  };

// Helper for handlers that run after requireAuth.
export function currentUser(req: { user?: AuthUser }): AuthUser {
  if (!req.user) throw new HttpError(401, "Not authenticated");
  return req.user;
}

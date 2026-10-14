import jwt from "jsonwebtoken";
import { config } from "../config.js";
import type { Role } from "../users/model.js";

export interface AuthUser {
  id: string;
  role: Role;
  name: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign({ role: user.role, name: user.name }, config.JWT_SECRET, {
    subject: user.id,
    expiresIn: config.JWT_TTL_SECONDS,
    algorithm: "HS256",
  });
}

export function verifyToken(token: string): AuthUser {
  // Pin the algorithm so a token signed with "none" or another alg is rejected.
  const payload = jwt.verify(token, config.JWT_SECRET, { algorithms: ["HS256"] }) as jwt.JwtPayload;
  return { id: payload.sub as string, role: payload.role as Role, name: payload.name as string };
}

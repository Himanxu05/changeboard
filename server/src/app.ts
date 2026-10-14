import express from "express";
import helmet from "helmet";
import mongoose from "mongoose";
import { authRouter } from "./auth/routes.js";
import { changesRouter } from "./changes/routes.js";
import { errorHandler } from "./errors.js";
import { usersRouter } from "./users/routes.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // behind nginx: use X-Forwarded-For for rate limiting
  app.use(helmet());
  app.use(express.json({ limit: "100kb" }));

  // Liveness/readiness for Docker and load balancers: 503 until MongoDB is connected.
  app.get("/health", (_req, res) => {
    const up = mongoose.connection.readyState === 1;
    res.status(up ? 200 : 503).json({ status: up ? "ok" : "db_unavailable" });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/changes", changesRouter);
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });
  app.use(errorHandler);
  return app;
}

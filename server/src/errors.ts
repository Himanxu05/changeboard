import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new HttpError(404, `${what} not found`);

// Express 5 forwards rejected promises from async handlers here, so routes
// can simply throw.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Invalid request", details: err.issues });
    return;
  }
  if (err?.name === "CastError") {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
};

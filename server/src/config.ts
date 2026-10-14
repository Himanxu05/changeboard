import { z } from "zod";

// Read and validate the environment once at startup. A missing or weak
// JWT_SECRET should crash the process now, not fail on the first login.
const schema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  MONGO_URL: z.string().default("mongodb://127.0.0.1:27017/changeboard"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
});

export const config = schema.parse(process.env);

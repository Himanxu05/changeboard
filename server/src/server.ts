import mongoose from "mongoose";
import { createApp } from "./app.js";
import { config } from "./config.js";

await mongoose.connect(config.MONGO_URL);
const server = createApp().listen(config.PORT, () => {
  console.log(`changeboard api listening on :${config.PORT}`);
});

// Graceful shutdown: stop accepting connections, let in-flight requests
// finish, then close the database. Docker sends SIGTERM on `docker stop`.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    console.log(`${signal} received, shutting down`);
    server.close(async () => {
      await mongoose.disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}

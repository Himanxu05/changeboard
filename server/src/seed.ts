// Demo data: one user per role, password "password123".
import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { config } from "./config.js";
import { User } from "./users/model.js";

await mongoose.connect(config.MONGO_URL);
const passwordHash = await bcrypt.hash("password123", 10);
const users = [
  { email: "admin@example.com", name: "Asha Admin", role: "admin" },
  { email: "approver1@example.com", name: "Arjun Approver", role: "approver" },
  { email: "approver2@example.com", name: "Priya Approver", role: "approver" },
  { email: "dev@example.com", name: "Dev Requester", role: "requester" },
];
for (const u of users) {
  await User.updateOne({ email: u.email }, { $set: { ...u, passwordHash } }, { upsert: true });
}
console.log(`seeded ${users.length} users (password: password123)`);
await mongoose.disconnect();

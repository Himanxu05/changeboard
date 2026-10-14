import { Schema, model, type InferSchemaType } from "mongoose";

export const ROLES = ["requester", "approver", "admin"] as const;
export type Role = (typeof ROLES)[number];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: "requester" },
  },
  { timestamps: true },
);

export type UserDoc = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);

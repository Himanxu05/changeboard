import { Schema, model, type Types } from "mongoose";
import { ACTIONS, RISKS, STATUSES, type Risk, type Status } from "./workflow.js";

const personSchema = new Schema({ id: { type: String, required: true }, name: { type: String, required: true } }, { _id: false });

const changeSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, required: true },
    system: { type: String, required: true },
    risk: { type: String, enum: RISKS, required: true },
    rollbackPlan: { type: String, required: true },
    windowStart: { type: Date, required: true },
    windowEnd: { type: Date, required: true },
    status: { type: String, enum: STATUSES, default: "draft" },
    owner: { type: personSchema, required: true },
    approvals: [{ _id: false, by: personSchema, at: Date }],
    // The audit trail lives inside the change document, so a status change
    // and its history entry are written in one atomic single-document update.
    history: [
      {
        _id: false,
        action: { type: String, enum: [...ACTIONS, "create", "edit"] },
        from: String,
        to: String,
        by: personSchema,
        comment: String,
        at: Date,
      },
    ],
    // Bumped on every write; updates are conditional on it (optimistic locking).
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Support the list queries: newest first, filtered by status or by owner.
changeSchema.index({ status: 1, _id: -1 });
changeSchema.index({ "owner.id": 1, _id: -1 });

interface Person {
  id: string;
  name: string;
}

// Plain-object shape returned by .lean() queries.
export interface ChangeDoc {
  _id: Types.ObjectId;
  title: string;
  description: string;
  system: string;
  risk: Risk;
  rollbackPlan: string;
  windowStart: Date;
  windowEnd: Date;
  status: Status;
  owner: Person;
  approvals: { by: Person; at: Date }[];
  history: { action: string; from?: string; to: string; by: Person; comment?: string; at: Date }[];
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
export const Change = model("Change", changeSchema);

import { Types } from "mongoose";
import type { AuthUser } from "../auth/tokens.js";
import { HttpError, notFound } from "../errors.js";
import { Change, type ChangeDoc } from "./model.js";
import { allowedActions, decide, requiredApprovals, type Action, type ChangeState, type Risk, type Status } from "./workflow.js";

export interface ChangeInput {
  title: string;
  description: string;
  system: string;
  risk: Risk;
  rollbackPlan: string;
  windowStart: Date;
  windowEnd: Date;
}

const person = (user: AuthUser) => ({ id: user.id, name: user.name });

function toState(change: ChangeDoc): ChangeState {
  return {
    status: change.status,
    ownerId: change.owner.id,
    risk: change.risk,
    approverIds: change.approvals.map((a) => a.by.id),
    windowStart: change.windowStart,
    windowEnd: change.windowEnd,
  };
}

export function toView(change: ChangeDoc, user: AuthUser, now = new Date()) {
  const { _id, __v, ...rest } = change as ChangeDoc & { __v?: number };
  return {
    id: String(_id),
    ...rest,
    requiredApprovals: requiredApprovals(change.risk),
    allowedActions: allowedActions(toState(change), user, now),
  };
}

export async function createChange(input: ChangeInput, user: AuthUser) {
  const now = new Date();
  const doc = await Change.create({
    ...input,
    owner: person(user),
    history: [{ action: "create", to: "draft", by: person(user), at: now }],
  });
  return doc.toObject<ChangeDoc>();
}

export async function editChange(id: string, input: Partial<ChangeInput>, user: AuthUser) {
  const change = await getChange(id);
  if (change.owner.id !== user.id) throw new HttpError(403, "Only the requester can edit this change");
  if (change.status !== "draft") throw new HttpError(409, "Only drafts can be edited");
  return conditionalUpdate(change, {
    $set: input,
    $push: { history: { action: "edit", from: "draft", to: "draft", by: person(user), at: new Date() } },
  });
}

export async function getChange(id: string) {
  const change = await Change.findById(id).lean<ChangeDoc>();
  if (!change) throw notFound("Change");
  return change;
}

export async function applyAction(id: string, action: Action, user: AuthUser, comment = "") {
  const change = await getChange(id);
  const now = new Date();
  const decision = decide(toState(change), user, action, now, comment);
  if (!decision.ok) throw new HttpError(decision.code, decision.reason);

  const entry = { action, from: change.status, to: decision.next, by: person(user), comment, at: now };
  const push: Record<string, unknown> = { history: entry };
  const set: Record<string, unknown> = { status: decision.next };
  if (action === "approve") push.approvals = { by: person(user), at: now };
  if (action === "revise") set.approvals = [];

  return conditionalUpdate(change, { $set: set, $push: push });
}

// Optimistic concurrency: the write only matches if nobody else has written
// since we read. Two approvers clicking at the same moment can't both "win".
async function conditionalUpdate(change: ChangeDoc, update: Record<string, object>) {
  const updated = await Change.findOneAndUpdate(
    { _id: change._id, version: change.version },
    { ...update, $inc: { version: 1 } },
    { returnDocument: "after", runValidators: true },
  ).lean<ChangeDoc>();
  if (!updated) throw new HttpError(409, "This change was modified by someone else. Reload and try again.");
  return updated;
}

export interface ListQuery {
  status?: Status;
  risk?: Risk;
  mine?: boolean;
  limit: number;
  cursor?: string;
}

// Keyset pagination on _id (newest first). Unlike skip/offset, the cost of
// a page doesn't grow with how deep you are, and rows don't shift between
// pages when new changes are created.
export async function listChanges(query: ListQuery, user: AuthUser) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.risk) filter.risk = query.risk;
  if (query.mine) filter["owner.id"] = user.id;
  if (query.cursor) {
    if (!Types.ObjectId.isValid(query.cursor)) throw new HttpError(400, "Invalid cursor");
    filter._id = { $lt: new Types.ObjectId(query.cursor) };
  }

  // The list view doesn't need each change's full history.
  const rows = await Change.find(filter, { history: 0 })
    .sort({ _id: -1 })
    .limit(query.limit + 1)
    .lean<ChangeDoc[]>();
  const hasMore = rows.length > query.limit;
  const page = rows.slice(0, query.limit);
  return {
    items: page.map((c) => toView(c, user)),
    nextCursor: hasMore ? String(page.at(-1)!._id) : null,
  };
}

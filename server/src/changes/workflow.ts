// The change-request lifecycle as a pure function: given a change, who is
// acting, and the time, decide whether an action is allowed and what the next
// status is. No database access here, so every rule is unit-testable.
//
//   draft ──submit──► submitted ──approve (enough approvals)──► approved ──start──► in_progress
//     ▲                   │                                       │                 │      │
//     └──revise── rejected◄┘reject                               │          complete      fail
//                                                                 │                 ▼      ▼
//   draft / submitted / approved ──cancel──► cancelled            │          completed  failed ──rollback──► rolled_back

import type { Role } from "../users/model.js";

export const STATUSES = [
  "draft",
  "submitted",
  "approved",
  "rejected",
  "in_progress",
  "completed",
  "failed",
  "rolled_back",
  "cancelled",
] as const;
export type Status = (typeof STATUSES)[number];

export const ACTIONS = ["submit", "approve", "reject", "revise", "start", "complete", "fail", "rollback", "cancel"] as const;
export type Action = (typeof ACTIONS)[number];

export const RISKS = ["low", "medium", "high"] as const;
export type Risk = (typeof RISKS)[number];

export interface ChangeState {
  status: Status;
  ownerId: string;
  risk: Risk;
  approverIds: string[];
  windowStart: Date;
  windowEnd: Date;
}

export interface Actor {
  id: string;
  role: Role;
}

export type Decision = { ok: true; next: Status } | { ok: false; code: 403 | 409 | 422; reason: string };

const FROM: Record<Action, readonly Status[]> = {
  submit: ["draft"],
  approve: ["submitted"],
  reject: ["submitted"],
  revise: ["rejected"],
  start: ["approved"],
  complete: ["in_progress"],
  fail: ["in_progress"],
  rollback: ["failed"],
  cancel: ["draft", "submitted", "approved"],
};

// High-risk changes need a second, independent approver.
export const requiredApprovals = (risk: Risk): number => (risk === "high" ? 2 : 1);

const deny = (code: 403 | 409 | 422, reason: string): Decision => ({ ok: false, code, reason });

export function decide(change: ChangeState, actor: Actor, action: Action, now: Date, comment = ""): Decision {
  if (!FROM[action].includes(change.status)) {
    return deny(409, `Cannot ${action} a change that is ${change.status}`);
  }

  const isOwner = actor.id === change.ownerId;
  const isAdmin = actor.role === "admin";

  switch (action) {
    case "submit":
    case "revise":
      if (!isOwner) return deny(403, `Only the requester can ${action} this change`);
      return { ok: true, next: action === "submit" ? "submitted" : "draft" };

    case "approve":
    case "reject": {
      if (actor.role !== "approver" && !isAdmin) return deny(403, "Only approvers can review changes");
      // Separation of duties: nobody reviews their own change, admins included.
      if (isOwner) return deny(403, "You cannot review your own change");
      if (change.approverIds.includes(actor.id)) return deny(409, "You already approved this change");
      if (action === "reject") {
        if (!comment.trim()) return deny(422, "A rejection needs a comment");
        return { ok: true, next: "rejected" };
      }
      const approvals = change.approverIds.length + 1;
      return { ok: true, next: approvals >= requiredApprovals(change.risk) ? "approved" : "submitted" };
    }

    case "start":
      if (!isOwner && !isAdmin) return deny(403, "Only the requester or an admin can start this change");
      if (now < change.windowStart || now > change.windowEnd) {
        return deny(422, "Changes can only start inside their approved change window");
      }
      return { ok: true, next: "in_progress" };

    case "complete":
    case "fail":
    case "rollback":
    case "cancel": {
      if (!isOwner && !isAdmin) return deny(403, `Only the requester or an admin can ${action} this change`);
      if (action === "fail" && !comment.trim()) return deny(422, "Describe what went wrong");
      const next: Record<typeof action, Status> = {
        complete: "completed",
        fail: "failed",
        rollback: "rolled_back",
        cancel: "cancelled",
      };
      return { ok: true, next: next[action] };
    }
  }
}

// What the UI should offer this user. Comment-required actions are listed,
// since the comment is supplied when the user clicks.
export function allowedActions(change: ChangeState, actor: Actor, now: Date): Action[] {
  return ACTIONS.filter((action) => decide(change, actor, action, now, "comment").ok);
}

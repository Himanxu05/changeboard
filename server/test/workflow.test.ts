import { describe, expect, it } from "vitest";
import { allowedActions, decide, type ChangeState } from "../src/changes/workflow.js";

const now = new Date("2026-10-14T12:00:00Z");
const base: ChangeState = {
  status: "draft",
  ownerId: "dev",
  risk: "low",
  approverIds: [],
  windowStart: new Date("2026-10-14T10:00:00Z"),
  windowEnd: new Date("2026-10-14T14:00:00Z"),
};
const dev = { id: "dev", role: "requester" as const };
const approver = { id: "a1", role: "approver" as const };
const approver2 = { id: "a2", role: "approver" as const };
const admin = { id: "root", role: "admin" as const };

describe("decide", () => {
  it("lets the owner submit a draft", () => {
    expect(decide(base, dev, "submit", now)).toEqual({ ok: true, next: "submitted" });
  });

  it("rejects actions that are invalid for the current status with 409", () => {
    expect(decide(base, approver, "approve", now)).toMatchObject({ ok: false, code: 409 });
    expect(decide({ ...base, status: "completed" }, dev, "cancel", now)).toMatchObject({ ok: false, code: 409 });
  });

  it("does not let a requester approve", () => {
    const submitted = { ...base, status: "submitted" as const };
    expect(decide(submitted, { id: "other", role: "requester" }, "approve", now)).toMatchObject({ ok: false, code: 403 });
  });

  it("enforces separation of duties, even for admins", () => {
    const own = { ...base, status: "submitted" as const, ownerId: "root" };
    expect(decide(own, admin, "approve", now)).toMatchObject({ ok: false, code: 403 });
  });

  it("approves a low-risk change after one approval", () => {
    const submitted = { ...base, status: "submitted" as const };
    expect(decide(submitted, approver, "approve", now)).toEqual({ ok: true, next: "approved" });
  });

  it("needs two different approvers for a high-risk change", () => {
    const high = { ...base, status: "submitted" as const, risk: "high" as const };
    expect(decide(high, approver, "approve", now)).toEqual({ ok: true, next: "submitted" });
    const once = { ...high, approverIds: ["a1"] };
    expect(decide(once, approver, "approve", now)).toMatchObject({ ok: false, code: 409 });
    expect(decide(once, approver2, "approve", now)).toEqual({ ok: true, next: "approved" });
  });

  it("requires a comment to reject or to mark failed", () => {
    const submitted = { ...base, status: "submitted" as const };
    expect(decide(submitted, approver, "reject", now, "  ")).toMatchObject({ ok: false, code: 422 });
    expect(decide(submitted, approver, "reject", now, "no rollback plan")).toEqual({ ok: true, next: "rejected" });
    const running = { ...base, status: "in_progress" as const };
    expect(decide(running, dev, "fail", now)).toMatchObject({ ok: false, code: 422 });
  });

  it("only starts inside the change window", () => {
    const approved = { ...base, status: "approved" as const };
    expect(decide(approved, dev, "start", now)).toEqual({ ok: true, next: "in_progress" });
    expect(decide(approved, dev, "start", new Date("2026-10-14T09:59:59Z"))).toMatchObject({ ok: false, code: 422 });
    expect(decide(approved, dev, "start", new Date("2026-10-14T14:00:01Z"))).toMatchObject({ ok: false, code: 422 });
  });

  it("lets an admin, but not another requester, roll back a failed change", () => {
    const failed = { ...base, status: "failed" as const };
    expect(decide(failed, admin, "rollback", now)).toEqual({ ok: true, next: "rolled_back" });
    expect(decide(failed, { id: "x", role: "requester" }, "rollback", now)).toMatchObject({ ok: false, code: 403 });
  });
});

describe("allowedActions", () => {
  it("offers the owner submit and cancel on a draft", () => {
    expect(allowedActions(base, dev, now)).toEqual(["submit", "cancel"]);
  });

  it("offers an approver approve and reject on a submitted change", () => {
    expect(allowedActions({ ...base, status: "submitted" }, approver, now)).toEqual(["approve", "reject"]);
  });
});

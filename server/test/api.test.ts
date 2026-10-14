import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { Change } from "../src/changes/model.js";
import { User } from "../src/users/model.js";

const app = createApp();
const tokens: Record<string, string> = {};

async function makeUser(email: string, role: "requester" | "approver" | "admin") {
  await User.create({ email, name: email.split("@")[0], role, passwordHash: await bcrypt.hash("password123", 4) });
  const res = await request(app).post("/api/auth/login").send({ email, password: "password123" });
  return res.body.token as string;
}

const auth = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });

function changeBody(overrides: Record<string, unknown> = {}) {
  const start = new Date(Date.now() - 60 * 60 * 1000);
  const end = new Date(Date.now() + 60 * 60 * 1000);
  return {
    title: "Upgrade payments service to v2.4",
    description: "Rolling upgrade of 3 replicas",
    system: "payments",
    risk: "low",
    rollbackPlan: "Redeploy v2.3 image",
    windowStart: start.toISOString(),
    windowEnd: end.toISOString(),
    ...overrides,
  };
}

async function createSubmitted(overrides: Record<string, unknown> = {}) {
  const created = await request(app).post("/api/changes").set(auth("dev")).send(changeBody(overrides));
  await request(app).post(`/api/changes/${created.body.id}/actions/submit`).set(auth("dev"));
  return created.body.id as string;
}

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URL!);
  await mongoose.connection.dropDatabase();
  await Change.syncIndexes();
  await User.syncIndexes();
  tokens.dev = await makeUser("dev@example.com", "requester");
  tokens.other = await makeUser("other@example.com", "requester");
  tokens.a1 = await makeUser("a1@example.com", "approver");
  tokens.a2 = await makeUser("a2@example.com", "approver");
  tokens.admin = await makeUser("admin@example.com", "admin");
});

beforeEach(async () => {
  await Change.deleteMany({});
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

describe("auth", () => {
  it("rejects requests without a token", async () => {
    expect((await request(app).get("/api/changes")).status).toBe(401);
  });

  it("rejects a tampered token", async () => {
    const res = await request(app).get("/api/changes").set({ Authorization: `Bearer ${tokens.dev}x` });
    expect(res.status).toBe(401);
  });

  it("gives the same error for unknown email and wrong password", async () => {
    const a = await request(app).post("/api/auth/login").send({ email: "nobody@example.com", password: "password123" });
    const b = await request(app).post("/api/auth/login").send({ email: "dev@example.com", password: "wrongpass1" });
    expect(a.status).toBe(401);
    expect(b.body).toEqual(a.body);
  });

  it("registers new users as requesters and refuses duplicates", async () => {
    const body = { email: "new@example.com", name: "New", password: "password123" };
    const first = await request(app).post("/api/auth/register").send(body);
    expect(first.status).toBe(201);
    expect(first.body.role).toBe("requester");
    expect((await request(app).post("/api/auth/register").send(body)).status).toBe(409);
  });

  it("only lets admins manage users", async () => {
    expect((await request(app).get("/api/users").set(auth("dev"))).status).toBe(403);
    expect((await request(app).get("/api/users").set(auth("admin"))).status).toBe(200);
  });
});

describe("change lifecycle", () => {
  it("validates input", async () => {
    const res = await request(app)
      .post("/api/changes")
      .set(auth("dev"))
      .send(changeBody({ windowEnd: "2000-01-01T00:00:00Z" }));
    expect(res.status).toBe(400);
  });

  it("runs a low-risk change from draft to completed and records every step", async () => {
    const id = await createSubmitted();
    const approve = await request(app).post(`/api/changes/${id}/actions/approve`).set(auth("a1"));
    expect(approve.body.status).toBe("approved");
    await request(app).post(`/api/changes/${id}/actions/start`).set(auth("dev")).expect(200);
    const done = await request(app).post(`/api/changes/${id}/actions/complete`).set(auth("dev"));
    expect(done.body.status).toBe("completed");
    expect(done.body.history.map((h: { action: string }) => h.action)).toEqual([
      "create",
      "submit",
      "approve",
      "start",
      "complete",
    ]);
    expect(done.body.allowedActions).toEqual([]);
  });

  it("keeps a high-risk change submitted until a second approver signs off", async () => {
    const id = await createSubmitted({ risk: "high" });
    const first = await request(app).post(`/api/changes/${id}/actions/approve`).set(auth("a1"));
    expect(first.body.status).toBe("submitted");
    expect(first.body.approvals).toHaveLength(1);
    const again = await request(app).post(`/api/changes/${id}/actions/approve`).set(auth("a1"));
    expect(again.status).toBe(409);
    const second = await request(app).post(`/api/changes/${id}/actions/approve`).set(auth("a2"));
    expect(second.body.status).toBe("approved");
  });

  it("stops the requester approving their own change", async () => {
    const id = await createSubmitted();
    expect((await request(app).post(`/api/changes/${id}/actions/approve`).set(auth("dev"))).status).toBe(403);
  });

  it("only allows editing drafts, by their owner", async () => {
    const created = await request(app).post("/api/changes").set(auth("dev")).send(changeBody());
    const id = created.body.id;
    expect((await request(app).patch(`/api/changes/${id}`).set(auth("other")).send({ title: "Hijack" })).status).toBe(403);
    const edited = await request(app).patch(`/api/changes/${id}`).set(auth("dev")).send({ title: "New title" });
    expect(edited.body.title).toBe("New title");
    await request(app).post(`/api/changes/${id}/actions/submit`).set(auth("dev"));
    expect((await request(app).patch(`/api/changes/${id}`).set(auth("dev")).send({ title: "Late" })).status).toBe(409);
  });

  it("lets exactly one of two concurrent approvals through on a single-approval change", async () => {
    const id = await createSubmitted();
    const results = await Promise.all([
      request(app).post(`/api/changes/${id}/actions/approve`).set(auth("a1")),
      request(app).post(`/api/changes/${id}/actions/approve`).set(auth("a2")),
    ]);
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    const final = await request(app).get(`/api/changes/${id}`).set(auth("dev"));
    expect(final.body.approvals).toHaveLength(1);
    expect(final.body.version).toBe(2); // submit + one approve
  });

  it("returns 404 for unknown ids and 400 for malformed ids", async () => {
    expect((await request(app).get(`/api/changes/${new mongoose.Types.ObjectId()}`).set(auth("dev"))).status).toBe(404);
    expect((await request(app).get("/api/changes/not-an-id").set(auth("dev"))).status).toBe(400);
  });
});

describe("listing", () => {
  it("pages through results with a cursor, newest first", async () => {
    for (let i = 0; i < 5; i++) {
      await request(app).post("/api/changes").set(auth("dev")).send(changeBody({ title: `Change number ${i}` }));
    }
    const p1 = await request(app).get("/api/changes?limit=2").set(auth("dev"));
    expect(p1.body.items.map((c: { title: string }) => c.title)).toEqual(["Change number 4", "Change number 3"]);
    const p2 = await request(app).get(`/api/changes?limit=2&cursor=${p1.body.nextCursor}`).set(auth("dev"));
    const p3 = await request(app).get(`/api/changes?limit=2&cursor=${p2.body.nextCursor}`).set(auth("dev"));
    expect(p3.body.items).toHaveLength(1);
    expect(p3.body.nextCursor).toBeNull();
    expect(p1.body.items[0].history).toBeUndefined();
  });

  it("filters by status and owner", async () => {
    await createSubmitted();
    await request(app).post("/api/changes").set(auth("other")).send(changeBody());
    const submitted = await request(app).get("/api/changes?status=submitted").set(auth("a1"));
    expect(submitted.body.items).toHaveLength(1);
    const mine = await request(app).get("/api/changes?mine=true").set(auth("other"));
    expect(mine.body.items).toHaveLength(1);
    expect(mine.body.items[0].owner.name).toBe("other");
  });
});

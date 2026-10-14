import { Router } from "express";
import { z } from "zod";
import { currentUser, requireAuth } from "../auth/middleware.js";
import { createChange, editChange, applyAction, getChange, listChanges, toView } from "./service.js";
import { ACTIONS, RISKS, STATUSES } from "./workflow.js";

const fields = {
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().min(1).max(5000),
  system: z.string().trim().min(1).max(100),
  risk: z.enum(RISKS),
  rollbackPlan: z.string().trim().min(1).max(5000),
  windowStart: z.coerce.date(),
  windowEnd: z.coerce.date(),
};

const windowOrdered = (c: { windowStart?: Date; windowEnd?: Date }) =>
  !c.windowStart || !c.windowEnd || c.windowEnd > c.windowStart;
const windowMessage = { message: "windowEnd must be after windowStart", path: ["windowEnd"] };

const createBody = z.object(fields).refine(windowOrdered, windowMessage);
const editBody = z.object(fields).partial().strict().refine(windowOrdered, windowMessage);

const listQuery = z.object({
  status: z.enum(STATUSES).optional(),
  risk: z.enum(RISKS).optional(),
  mine: z.stringbool().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

const actionBody = z.object({ comment: z.string().trim().max(2000).default("") });

export const changesRouter = Router();
changesRouter.use(requireAuth);

changesRouter.get("/", async (req, res) => {
  res.json(await listChanges(listQuery.parse(req.query), currentUser(req)));
});

changesRouter.post("/", async (req, res) => {
  const user = currentUser(req);
  const change = await createChange(createBody.parse(req.body), user);
  res.status(201).json(toView(change, user));
});

changesRouter.get("/:id", async (req, res) => {
  res.json(toView(await getChange(req.params.id), currentUser(req)));
});

changesRouter.patch("/:id", async (req, res) => {
  const user = currentUser(req);
  res.json(toView(await editChange(req.params.id, editBody.parse(req.body), user), user));
});

changesRouter.post("/:id/actions/:action", async (req, res) => {
  const user = currentUser(req);
  const action = z.enum(ACTIONS).parse(req.params.action);
  const { comment } = actionBody.parse(req.body ?? {});
  res.json(toView(await applyAction(req.params.id, action, user, comment), user));
});

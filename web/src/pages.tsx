import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Change } from "./api";
import { useAuth } from "./auth";

const fmt = (iso: string) => new Date(iso).toLocaleString();
// Actions where the server requires (or benefits from) a comment.
const NEEDS_COMMENT = new Set(["reject", "fail"]);

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("dev@example.com");
  const [password, setPassword] = useState("password123");
  const [error, setError] = useState("");

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Sign in</h2>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      </label>
      <label>
        Password
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit">Sign in</button>
      <p className="muted">Demo users: dev@, approver1@, approver2@, admin@example.com / password123</p>
    </form>
  );
}

export function ListPage() {
  const [status, setStatus] = useState("");
  const [items, setItems] = useState<Change[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = async (after: string | null) => {
    const params = new URLSearchParams({ limit: "20" });
    if (status) params.set("status", status);
    if (after) params.set("cursor", after);
    try {
      const page = await api<{ items: Change[]; nextCursor: string | null }>(`/changes?${params}`);
      setItems((prev) => (after ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return (
    <div>
      <div className="toolbar">
        <h2>Change requests</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["draft", "submitted", "approved", "rejected", "in_progress", "completed", "failed", "rolled_back", "cancelled"].map(
            (s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ),
          )}
        </select>
        <Link to="/new" className="button">
          New change
        </Link>
      </div>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>System</th>
            <th>Risk</th>
            <th>Status</th>
            <th>Owner</th>
            <th>Window start</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td>
                <Link to={`/changes/${c.id}`}>{c.title}</Link>
              </td>
              <td>{c.system}</td>
              <td className={`risk-${c.risk}`}>{c.risk}</td>
              <td>
                <span className={`status status-${c.status}`}>{c.status}</span>
              </td>
              <td>{c.owner.name}</td>
              <td>{fmt(c.windowStart)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {items.length === 0 && <p className="muted">No changes yet.</p>}
      {cursor && <button onClick={() => load(cursor)}>Load more</button>}
    </div>
  );
}

const toLocalInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function NewChangePage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    title: "",
    description: "",
    system: "",
    risk: "low",
    rollbackPlan: "",
    windowStart: toLocalInput(new Date()),
    windowEnd: toLocalInput(new Date(Date.now() + 2 * 3600 * 1000)),
  });
  const [error, setError] = useState("");
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      const created = await api<Change>("/changes", {
        method: "POST",
        body: {
          ...form,
          windowStart: new Date(form.windowStart).toISOString(),
          windowEnd: new Date(form.windowEnd).toISOString(),
        },
      });
      navigate(`/changes/${created.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>New change request</h2>
      <label>
        Title
        <input value={form.title} onChange={set("title")} required minLength={3} />
      </label>
      <label>
        Affected system
        <input value={form.system} onChange={set("system")} required />
      </label>
      <label>
        Risk
        <select value={form.risk} onChange={set("risk")}>
          <option value="low">low (1 approval)</option>
          <option value="medium">medium (1 approval)</option>
          <option value="high">high (2 approvals)</option>
        </select>
      </label>
      <label>
        Description
        <textarea value={form.description} onChange={set("description")} required />
      </label>
      <label>
        Rollback plan
        <textarea value={form.rollbackPlan} onChange={set("rollbackPlan")} required />
      </label>
      <div className="row">
        <label>
          Window start
          <input type="datetime-local" value={form.windowStart} onChange={set("windowStart")} required />
        </label>
        <label>
          Window end
          <input type="datetime-local" value={form.windowEnd} onChange={set("windowEnd")} required />
        </label>
      </div>
      {error && <p className="error">{error}</p>}
      <button type="submit">Create draft</button>
    </form>
  );
}

export function DetailPage() {
  const { id } = useParams();
  const [change, setChange] = useState<Change | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<Change>(`/changes/${id}`).then(setChange, (err: Error) => setError(err.message));
  }, [id]);

  const act = async (action: string) => {
    setError("");
    try {
      setChange(await api<Change>(`/changes/${id}/actions/${action}`, { method: "POST", body: { comment } }));
      setComment("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (!change) return error ? <p className="error">{error}</p> : <p>Loading…</p>;

  return (
    <div className="card">
      <div className="toolbar">
        <h2>{change.title}</h2>
        <span className={`status status-${change.status}`}>{change.status}</span>
      </div>
      <dl>
        <dt>System</dt>
        <dd>{change.system}</dd>
        <dt>Risk</dt>
        <dd className={`risk-${change.risk}`}>
          {change.risk} — approvals {change.approvals.length}/{change.requiredApprovals}
        </dd>
        <dt>Window</dt>
        <dd>
          {fmt(change.windowStart)} → {fmt(change.windowEnd)}
        </dd>
        <dt>Requester</dt>
        <dd>{change.owner.name}</dd>
        <dt>Description</dt>
        <dd className="pre">{change.description}</dd>
        <dt>Rollback plan</dt>
        <dd className="pre">{change.rollbackPlan}</dd>
      </dl>

      {change.allowedActions.length > 0 && (
        <div className="actions">
          <textarea
            placeholder="Comment (required to reject or mark failed)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          {change.allowedActions.map((a) => (
            <button
              key={a}
              className={a === "reject" || a === "fail" || a === "cancel" ? "danger" : ""}
              disabled={NEEDS_COMMENT.has(a) && !comment.trim()}
              onClick={() => act(a)}
            >
              {a}
            </button>
          ))}
        </div>
      )}
      {error && <p className="error">{error}</p>}

      <h3>Audit trail</h3>
      <ol className="history">
        {change.history?.map((h, i) => (
          <li key={i}>
            <strong>{h.action}</strong> {h.from && `${h.from} → `}
            {h.to} by {h.by.name} at {fmt(h.at)}
            {h.comment && <em> — “{h.comment}”</em>}
          </li>
        ))}
      </ol>
    </div>
  );
}

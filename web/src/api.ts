// Thin fetch wrapper: adds the JWT, parses JSON, turns error responses into
// thrown Errors carrying the server's message.

export type Role = "requester" | "approver" | "admin";
export interface User {
  id: string;
  name: string;
  role: Role;
}
export interface Person {
  id: string;
  name: string;
}
export interface Change {
  id: string;
  title: string;
  description: string;
  system: string;
  risk: "low" | "medium" | "high";
  rollbackPlan: string;
  windowStart: string;
  windowEnd: string;
  status: string;
  owner: Person;
  approvals: { by: Person; at: string }[];
  history?: { action: string; from?: string; to: string; by: Person; comment?: string; at: string }[];
  requiredApprovals: number;
  allowedActions: string[];
  version: number;
}

const TOKEN_KEY = "changeboard.token";
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) =>
  token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY);

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token) {
    setToken(null);
    window.location.assign("/login");
  }
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

import { DrawingDocument } from "@pcad/core";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

export interface CloudUser {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
}

export interface CloudDrawingSummary {
  id: string;
  title: string;
  visibility: "private" | "public";
  createdAt: string;
  updatedAt: string;
}

export interface CloudDrawingFull extends CloudDrawingSummary {
  document: DrawingDocument;
  paramsText: string;
  isOwner?: boolean;
}

class CloudApiError extends Error {}

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new CloudApiError(body.error || res.statusText);
  }
  return res.json();
}

export function googleLoginUrl(): string {
  return `${API_BASE}/api/auth/google`;
}

export function devLoginUrl(email: string, name: string): string {
  return `${API_BASE}/api/auth/dev-login?email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}`;
}

export function getMe(): Promise<{ user: CloudUser | null; devMode: boolean }> {
  return api("/api/auth/me");
}

export async function logout(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
}

export function listMyDrawings(): Promise<{ drawings: CloudDrawingSummary[] }> {
  return api("/api/drawings");
}

export function createCloudDrawing(
  title: string,
  document: DrawingDocument,
  paramsText: string,
  visibility: "private" | "public" = "private",
): Promise<CloudDrawingFull> {
  return api("/api/drawings", { method: "POST", body: JSON.stringify({ title, document, paramsText, visibility }) });
}

export function getCloudDrawing(id: string): Promise<CloudDrawingFull> {
  return api(`/api/drawings/${id}`);
}

export function updateCloudDrawing(
  id: string,
  fields: Partial<{ title: string; document: DrawingDocument; paramsText: string; visibility: "private" | "public" }>,
): Promise<CloudDrawingFull> {
  return api(`/api/drawings/${id}`, { method: "PUT", body: JSON.stringify(fields) });
}

export async function deleteCloudDrawing(id: string): Promise<void> {
  await api(`/api/drawings/${id}`, { method: "DELETE" });
}

export function shareUrlFor(id: string): string {
  return `${window.location.origin}${window.location.pathname}#/d/${id}`;
}

import type {
  AskResult,
  DocumentClause,
  DocumentDetail,
  DocumentGraph,
  DocumentSummary,
  Entity,
  Risk,
} from "./apiTypes";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";
export const ACCESS_TOKEN_KEY = "nyayalens_access_token";
export const REFRESH_TOKEN_KEY = "nyayalens_refresh_token";

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInMinutes: number;
}

// Thrown for a 401/403 specifically, so callers (see AuthProvider) can
// redirect to /login without guessing from a generic Error message.
export class UnauthorizedError extends Error {
  constructor(public status: 401 | 403) {
    super(status === 401 ? "Not authenticated" : "Not authorized");
    this.name = "UnauthorizedError";
  }
}

export class NotFoundError extends Error {
  constructor() {
    super("Not found");
    this.name = "NotFoundError";
  }
}

async function parseErrorMessage(res: Response): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: unknown };
  if (typeof body.error === "string") return body.error;
  if (body.error && typeof body.error === "object") return JSON.stringify(body.error);
  return `Request failed with status ${res.status}`;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (res.status === 401 || res.status === 403) {
    throw new UnauthorizedError(res.status);
  }
  if (res.status === 404) {
    throw new NotFoundError();
  }
  if (!res.ok) {
    throw new Error(await parseErrorMessage(res));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE_URL}${path}`, { ...init, headers });
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

export function register(email: string, password: string): Promise<TokenResponse> {
  return postJson<TokenResponse>("/auth/register", { email, password });
}

export function login(email: string, password: string): Promise<TokenResponse> {
  return postJson<TokenResponse>("/auth/login", { email, password });
}

export async function listDocumentSummaries(): Promise<DocumentSummary[]> {
  const res = await authedFetch("/documents/summary");
  const body = await handleResponse<{ documents: DocumentSummary[] }>(res);
  return body.documents;
}

export async function getDocument(id: string): Promise<DocumentDetail> {
  const res = await authedFetch(`/documents/${id}`);
  const body = await handleResponse<{ document: DocumentDetail }>(res);
  return body.document;
}

export async function getEntities(id: string): Promise<Entity[]> {
  const res = await authedFetch(`/documents/${id}/entities`);
  const body = await handleResponse<{ entities: Entity[] }>(res);
  return body.entities;
}

export async function getClauses(id: string): Promise<DocumentClause[]> {
  const res = await authedFetch(`/documents/${id}/clauses`);
  const body = await handleResponse<{ clauses: DocumentClause[] }>(res);
  return body.clauses;
}

export async function getRisks(id: string): Promise<Risk[]> {
  const res = await authedFetch(`/documents/${id}/risks`);
  const body = await handleResponse<{ risks: Risk[] }>(res);
  return body.risks;
}

export async function getGraph(id: string): Promise<DocumentGraph> {
  const res = await authedFetch(`/documents/${id}/graph`);
  const body = await handleResponse<{ graph: DocumentGraph }>(res);
  return body.graph;
}

export async function askDocument(id: string, question: string): Promise<AskResult> {
  const res = await authedFetch(`/documents/${id}/ask`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });
  return handleResponse<AskResult>(res);
}

// documentType is the lowercase wire value the upload endpoint's Zod
// schema validates (apps/api/src/routes/documents.ts's uploadMetadataSchema)
// - a plain string, sourced from UploadDocumentForm's DOCUMENT_TYPE_OPTIONS,
// not a hardcoded two-value union (see docs/phase8/step2_migration_notes.md).
export async function uploadDocument(file: File, documentType: string): Promise<{ id: string }> {
  const form = new FormData();
  form.append("documentType", documentType);
  form.append("file", file);
  const res = await authedFetch("/documents", { method: "POST", body: form });
  return handleResponse<{ id: string }>(res);
}

export async function deleteDocument(id: string): Promise<void> {
  const res = await authedFetch(`/documents/${id}`, { method: "DELETE" });
  await handleResponse<void>(res);
}

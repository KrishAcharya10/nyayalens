const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInMinutes: number;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const error = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof error.error === "string" ? error.error : `Request to ${path} failed`);
  }
  return res.json() as Promise<T>;
}

export function register(email: string, password: string): Promise<TokenResponse> {
  return postJson<TokenResponse>("/auth/register", { email, password });
}

export function login(email: string, password: string): Promise<TokenResponse> {
  return postJson<TokenResponse>("/auth/login", { email, password });
}

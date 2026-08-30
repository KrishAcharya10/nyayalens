"use client";

import { useState } from "react";
import { login } from "@/lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Submitting...");
    try {
      const tokens = await login(email, password);
      // Phase 1-2 scope: prove the auth flow works end-to-end. Persistent
      // client-side session storage/refresh scheduling is a later-phase concern.
      sessionStorage.setItem("nyayalens_access_token", tokens.accessToken);
      sessionStorage.setItem("nyayalens_refresh_token", tokens.refreshToken);
      setStatus("Logged in.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Login failed");
    }
  }

  return (
    <main style={{ maxWidth: 400, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>Log in</h1>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit">Log in</button>
      </form>
      {status && <p>{status}</p>}
    </main>
  );
}

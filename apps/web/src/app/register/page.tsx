"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/AuthProvider";
import { Button } from "@/components/ui/Button";
import { AuthLayout } from "@/components/shell/AuthLayout";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await register(email, password);
      router.push("/documents");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-sm rounded-lg border border-ink-200 bg-paper-50 p-8 shadow-panel">
        <p className="text-sm font-semibold tracking-wide text-ink-800 lg:hidden">NYAYALENS</p>
        <h1 className="mt-1 text-page-title text-ink-900">Create account</h1>
        <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-ink-600">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded border border-ink-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 focus-visible:border-saffron-500"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-600">
            Password (min 8 characters)
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className="rounded border border-ink-200 bg-paper-50 px-3 py-2 text-sm text-ink-800 focus-visible:border-saffron-500"
            />
          </label>
          <Button type="submit" variant="primary" disabled={submitting} className="mt-2 w-full">
            {submitting ? "Creating account..." : "Create account"}
          </Button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-xs text-risk-text">
            {error}
          </p>
        )}
        <p className="mt-6 text-xs text-ink-400">
          Already have an account?{" "}
          <Link href="/login" className="text-ink-600 underline">
            Sign in
          </Link>
        </p>
      </div>
    </AuthLayout>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthProvider";
import { Spinner } from "@/components/ui/States";

export default function HomePage() {
  const { isAuthenticated, isReady } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isReady) return;
    router.replace(isAuthenticated ? "/documents" : "/login");
  }, [isReady, isAuthenticated, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper-100">
      <Spinner className="h-5 w-5" />
    </main>
  );
}

import Link from "next/link";

export default function HomePage() {
  return (
    <main style={{ maxWidth: 480, margin: "4rem auto", fontFamily: "sans-serif" }}>
      <h1>NyayaLens</h1>
      <p>Indian legal document intelligence platform (Phase 1-2: repository, database, auth).</p>
      <p>
        <Link href="/login">Log in</Link> · <Link href="/register">Register</Link>
      </p>
    </main>
  );
}

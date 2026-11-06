import Link from "next/link";

export const metadata = { title: "Not found / Causewayside" };

export default function NotFound() {
  return (
    <main style={{ minHeight: "100dvh", display: "grid", placeItems: "center", padding: 24, background: "var(--ground)", color: "var(--ink)", textAlign: "center" }}>
      <div>
        <h1 style={{ margin: "0 0 12px" }}>No route here.</h1>
        <p style={{ margin: "0 0 24px", color: "var(--muted)" }}>That page doesn&rsquo;t exist.</p>
        <Link href="/" style={{ background: "var(--accent)", color: "var(--accent-ink)", padding: "12px 20px", borderRadius: 999, textDecoration: "none" }}>
          Back to the map
        </Link>
      </div>
    </main>
  );
}

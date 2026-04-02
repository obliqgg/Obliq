import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page-shell">
      <section className="centered-panel">
        <div className="panel panel-auth">
          <div className="panel-heading">
            <p className="eyebrow">Routing Failure</p>
            <h1>Signal lost</h1>
          </div>
          <p className="auth-copy">
            The route you requested does not exist in the current season shell. That may mean the
            path is wrong, the surface is not unlocked, or ARCHON never intended it to be public.
          </p>
          <div className="hero-actions">
            <Link href="/" className="primary-button">
              Return home
            </Link>
            <Link href="/archon" className="ghost-button">
              Return to archon
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

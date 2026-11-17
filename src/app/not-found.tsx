import Link from "next/link";

export default function NotFound() {
  return (
    <main className="section">
      <p className="kicker">404</p>
      <h1 className="display">This page is not on the site.</h1>
      <Link className="btn orange" href="/">Back to BUILDEX</Link>
    </main>
  );
}

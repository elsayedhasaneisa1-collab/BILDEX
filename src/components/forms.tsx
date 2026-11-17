"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/client";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      await api(`/api/auth/${mode === "login" ? "login" : "register"}`, Object.fromEntries(data.entries()));
      const requested = new URLSearchParams(location.search).get("next") || "/dashboard";
      const next = requested.startsWith("/") && !requested.startsWith("//") ? requested : "/dashboard";
      router.push(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not continue");
      setPending(false);
    }
  }
  return (
    <form className="card" onSubmit={onSubmit} style={{ maxWidth: 460, margin: "40px auto" }}>
      <h1 className="display">{mode === "login" ? "Sign in" : "Create account"}</h1>
      {error && <div className="form-error">{error}</div>}
      {mode === "register" && <label className="field"><span>Name</span><input name="name" required minLength={2} /></label>}
      {mode === "register" && <label className="field"><span>Username</span><input name="username" required pattern="[a-z0-9_]{3,24}" /></label>}
      <label className="field"><span>Email</span><input name="email" type="email" required /></label>
      <label className="field"><span>Password</span><input name="password" type="password" required minLength={mode === "register" ? 10 : 1} /></label>
      <button className="btn orange" disabled={pending} type="submit">{pending ? "Working" : mode === "login" ? "Sign in" : "Create account"}</button>
      {mode === "login" && <p><a href="/forgot-password">Forgot password</a></p>}

    </form>
  );
}

export function ForgotForm() {
  const [result, setResult] = useState("");
  return (
    <form className="card" style={{ maxWidth: 520, margin: "40px auto" }} onSubmit={async (event) => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(event.currentTarget).entries());
      const res = await api<{ message?: string }>("/api/auth/forgot", data);
      setResult(res.message || "If the account exists, a reset link will be sent when email delivery is configured.");
    }}>
      <h1 className="display">Reset password</h1>
      <p>Enter your account email. If email delivery is enabled, a one-time reset link will be sent and will expire in one hour.</p>
      <label className="field"><span>Email</span><input name="email" type="email" required /></label>
      <button className="btn orange" type="submit">Send reset email</button>
      {result && <p>{result}</p>}
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <form className="card" style={{ maxWidth: 520, margin: "40px auto" }} onSubmit={async (event) => {
      event.preventDefault();
      const password = String(new FormData(event.currentTarget).get("password") || "");
      try {
        await api("/api/auth/reset", { token, password });
        router.push("/login");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Reset failed");
      }
    }}>
      <h1 className="display">Choose a new password</h1>
      {error && <div className="form-error">{error}</div>}
      <label className="field"><span>New password</span><input name="password" type="password" minLength={10} required /></label>
      <button className="btn orange" type="submit">Update password</button>
    </form>
  );
}

export function ContactForm({ intent = "contact" }: { intent?: "contact" | "join" }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  if (done) return <p className="notice">Received. A person on the desk can read it in Command Center.</p>;
  return (
    <form className="card" onSubmit={async (event) => {
      event.preventDefault();
      try {
        await api("/api/support", { intent, ...Object.fromEntries(new FormData(event.currentTarget).entries()) });
        setDone(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not send");
      }
    }}>
      {error && <div className="form-error">{error}</div>}
      <label className="field"><span>Name</span><input name="name" required /></label>
      <label className="field"><span>Email</span><input name="email" type="email" required /></label>
      {intent === "join" && <label className="field"><span>Role</span><input name="roleInterest" placeholder="Reviewer, support, designer" /></label>}
      {intent === "contact" && <label className="field"><span>Subject</span><input name="subject" required /></label>}
      <label className="field"><span>Message</span><textarea name="message" required rows={5} /></label>
      <button className="btn orange" type="submit">Send</button>
    </form>
  );
}

export function ActionButton({ label, action, payload, href }: { label: string; action: string; payload?: Record<string, unknown>; href?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  return (
    <span>
      <button className="btn small" type="button" onClick={async () => {
        try {
          await api(action, payload || {});
          if (href) router.push(href);
          else router.refresh();
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed");
        }
      }}>{label}</button>
      {error && <small>{error}</small>}
    </span>
  );
}

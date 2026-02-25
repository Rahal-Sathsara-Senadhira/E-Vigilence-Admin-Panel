import React from "react";
import { useNavigate } from "react-router-dom";
import { setAuth } from "../../utils/auth";

export default function Login() {
  const nav = useNavigate();

  const [email, setEmail] = React.useState("admin@evigilance.com");
  const [password, setPassword] = React.useState("admin123");
  const [error, setError] = React.useState("");

  function onSubmit(e) {
    e.preventDefault();
    setError("");

    // ✅ TEMP demo auth (replace with real backend later)
    if (email === "admin@evigilance.com" && password === "admin123") {
      setAuth({
        token: "demo-token",
        user: {
          name: "Alex Ortega",
          email,
          role: "admin",
        },
      });
      nav("/dashboard", { replace: true });
      return;
    }

    setError("Invalid credentials (try admin@evigilance.com / admin123)");
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h1 className="text-xl font-semibold text-slate-100">E Vigilance</h1>
        <p className="text-sm text-slate-400 mt-1">Admin Panel Login</p>

        {error && (
          <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <form onSubmit={onSubmit} className="mt-4 grid gap-3">
          <div>
            <p className="text-sm text-slate-400">Email</p>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
            />
          </div>

          <div>
            <p className="text-sm text-slate-400">Password</p>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950/60 p-2 text-sm text-slate-100"
            />
          </div>

          <button className="rounded-xl border border-cyan-700 bg-cyan-600/20 p-2 text-cyan-200">
            Sign in
          </button>

          <p className="text-xs text-slate-500">
            Demo: admin@evigilance.com / admin123
          </p>
        </form>
      </div>
    </div>
  );
}
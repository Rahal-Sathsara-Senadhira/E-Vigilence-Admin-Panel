import React from "react";
import { useNavigate } from "react-router-dom";
import { setAuth } from "../../utils/auth";
import { api } from "../../services/api";
import { isStationRole } from "../../utils/roles";

export default function Login() {
  const nav = useNavigate();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await api.post("/api/auth/login", { email, password });

      // expected: { data: { token, user } }
      const token = res?.data?.token;
      const user = res?.data?.user;

      if (!token || !user) {
        throw new Error("Unexpected response from server");
      }

      setAuth({ token, user });

      if (isStationRole(user.role)) nav("/station/inbox", { replace: true });
      else nav("/dashboard", { replace: true });
    } catch (err) {
      setError(err?.message || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 grid place-items-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/40 p-5">
        <h1 className="text-xl font-semibold text-slate-100">E Vigilance</h1>
        <p className="text-sm text-slate-400 mt-1">Admin / Station Login</p>

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

          <button
            disabled={loading}
            className="rounded-xl border border-cyan-700 bg-cyan-600/20 p-2 text-cyan-200 disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

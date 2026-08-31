"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PassWithDuration } from "@/lib/types";
import { apiFetch } from "@/lib/api";

type SortKey = "status" | "time";

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function fmtHours(hours: number | null) {
  if (hours === null) return "—";
  if (hours < 24) return `${Math.round(hours)}h`;
  const d = Math.floor(hours / 24);
  const h = Math.round(hours - d * 24);
  return `${d}d ${h}h`;
}

export default function AdminDashboard() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [passes, setPasses] = useState<PassWithDuration[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sort, setSort] = useState<SortKey>("status");
  const [busyId, setBusyId] = useState<string | null>(null);

  const checkSession = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/session", { cache: "no-store" });
      const json = await res.json();
      setAuthed(Boolean(json.authed));
    } catch {
      setAuthed(false);
    }
  }, []);

  const loadPasses = useCallback(async () => {
    setLoading(true);
    try {
      const json = await apiFetch<{ passes: PassWithDuration[] }>("/api/passes");
      setPasses(json.passes);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (authed) loadPasses();
  }, [authed, loadPasses]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    try {
      await apiFetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      setPassword("");
      setAuthed(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : "Login failed.");
    }
  };

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    setAuthed(false);
    setPasses([]);
  };

  const forceReturn = async (passId: string) => {
    if (
      !window.confirm(
        `Force-return pass ${passId}? This marks it available without email confirmation and emails the last holder.`
      )
    )
      return;
    setBusyId(passId);
    try {
      await apiFetch("/api/admin/force-return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passId }),
      });
      await loadPasses();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Force return failed.");
    } finally {
      setBusyId(null);
    }
  };

  const sorted = useMemo(() => {
    const copy = [...passes];
    if (sort === "time") {
      copy.sort((a, b) => (b.hours_out ?? -1) - (a.hours_out ?? -1));
    } else {
      copy.sort((a, b) => {
        if (a.status !== b.status) return a.status === "out" ? -1 : 1;
        return a.id.localeCompare(b.id);
      });
    }
    return copy;
  }, [passes, sort]);

  const availCount = passes.filter((p) => p.status === "available").length;
  const outCount = passes.filter((p) => p.status === "out").length;

  // ---- Login screen -------------------------------------------------------
  if (authed === null) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-100 text-slate-500">
        Loading…
      </main>
    );
  }

  if (!authed) {
    return (
      <main className="min-h-screen grid place-items-center bg-slate-100 p-6">
        <form
          onSubmit={login}
          className="w-full max-w-sm bg-white rounded-2xl shadow p-6 space-y-4"
        >
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-400">
              Parking Passes
            </div>
            <h1 className="text-xl font-extrabold text-slate-900">
              Admin sign in
            </h1>
          </div>
          <input
            type="password"
            autoFocus
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-[15px] outline-none focus:border-slate-900"
            placeholder="Admin password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {loginError && (
            <p className="text-sm text-red-600">{loginError}</p>
          )}
          <button
            type="submit"
            className="w-full bg-slate-900 text-white rounded-xl py-3 font-bold text-sm"
          >
            Sign in
          </button>
        </form>
      </main>
    );
  }

  // ---- Dashboard ---------------------------------------------------------
  return (
    <main className="min-h-screen bg-slate-100">
      <header className="bg-slate-900 px-5 py-6">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              Associa British Columbia
            </div>
            <h1 className="text-2xl font-extrabold text-slate-50">
              Parking Pass Admin
            </h1>
          </div>
          <button
            onClick={logout}
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-5 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="bg-white rounded-xl shadow px-4 py-3">
            <div className="text-2xl font-extrabold text-emerald-700">
              {availCount}
            </div>
            <div className="text-xs text-slate-500">available</div>
          </div>
          <div className="bg-white rounded-xl shadow px-4 py-3">
            <div className="text-2xl font-extrabold text-orange-700">
              {outCount}
            </div>
            <div className="text-xs text-slate-500">checked out</div>
          </div>
          <div className="flex-1" />
          <a
            href="/api/admin/export"
            className="bg-slate-900 text-white rounded-lg px-4 py-2.5 text-sm font-bold"
          >
            Export CSV
          </a>
          <button
            onClick={loadPasses}
            className="border border-slate-300 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700"
          >
            Refresh
          </button>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Sort by:</span>
          <button
            onClick={() => setSort("status")}
            className={`rounded-md px-3 py-1 font-semibold ${
              sort === "status"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            Status (out first)
          </button>
          <button
            onClick={() => setSort("time")}
            className={`rounded-md px-3 py-1 font-semibold ${
              sort === "time"
                ? "bg-slate-900 text-white"
                : "bg-white text-slate-600 border border-slate-200"
            }`}
          >
            Time out (longest first)
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-500 border-b border-slate-100">
                <th className="px-3 py-3">Pass</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Holder</th>
                <th className="px-3 py-3">Email</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Checked out</th>
                <th className="px-3 py-3">Time out</th>
                <th className="px-3 py-3">Reminders</th>
                <th className="px-3 py-3" />
              </tr>
            </thead>
            <tbody>
              {loading && passes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-slate-400">
                    Loading…
                  </td>
                </tr>
              ) : (
                sorted.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-slate-50 last:border-0"
                  >
                    <td className="px-3 py-2.5 font-bold text-slate-900">
                      {p.id}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                          p.status === "out"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-emerald-100 text-emerald-800"
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">{p.holder_name || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {p.holder_email || "—"}
                    </td>
                    <td className="px-3 py-2.5">{p.holder_type || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {fmtDateTime(p.issued_at)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {fmtHours(p.hours_out)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">
                      {p.reminder_count}
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      {p.status === "out" && (
                        <button
                          onClick={() => forceReturn(p.id)}
                          disabled={busyId === p.id}
                          className="text-xs font-semibold text-orange-700 border border-orange-200 rounded-md px-2 py-1 disabled:opacity-50"
                        >
                          {busyId === p.id ? "…" : "Force return"}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

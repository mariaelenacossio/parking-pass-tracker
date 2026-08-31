"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { HolderType, PassStatus, PassWithDuration } from "@/lib/types";
import { apiFetch } from "@/lib/api";

// ---------------------------------------------------------------------------
// Local view model — flattened from the API's pass shape
// ---------------------------------------------------------------------------
interface UiPass {
  id: string;
  status: PassStatus;
  holder: string | null;
  email: string | null;
  type: HolderType | null;
  hoursOut: number | null;
}

function toUiPass(p: PassWithDuration): UiPass {
  return {
    id: p.id,
    status: p.status,
    holder: p.holder_name,
    email: p.holder_email,
    type: p.holder_type,
    hoursOut: p.hours_out,
  };
}

type View = "home" | "issue" | "return" | "success";
type FormState = { name: string; email: string; type: HolderType };
type Success =
  | { action: "issued"; pass: string; name: string; email: string }
  | { action: "returned"; pass: string; name: string | null };

const CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  .app   { min-height: 100vh; background: #f1f5f9; font-family: system-ui, -apple-system, sans-serif; }
  .hdr        { background: #0f172a; padding: 20px 20px 32px; }
  .hdr-inner  { max-width: 900px; margin: 0 auto; }
  .hdr-label  { font-size: 11px; color: #475569; margin-bottom: 8px; }
  .hdr-title  { font-size: 26px; font-weight: 800; color: #f8fafc; letter-spacing: -0.4px; }
  .hdr-sub    { font-size: 13px; color: #64748b; margin-top: 4px; }
  .hdr-badges { margin-top: 12px; display: flex; gap: 8px; }
  .badge-g    { background: #14532d; border-radius: 20px; padding: 3px 11px; font-size: 11px; font-weight: 700; color: #86efac; }
  .badge-o    { background: #7c2d12; border-radius: 20px; padding: 3px 11px; font-size: 11px; font-weight: 700; color: #fdba74; }
  .back-btn   { background: none; border: none; color: #64748b; font-size: 14px; cursor: pointer; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
  .page       { max-width: 460px; margin: 0 auto; padding: 20px 16px; }
  .card       { background: #fff; border-radius: 16px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.07); }
  .card-label { font-size: 12px; font-weight: 600; color: #64748b; margin-bottom: 12px; }
  .home-cards { display: flex; flex-direction: column; gap: 10px; margin-top: -16px; }
  .home-btn   { background: #fff; border: none; border-radius: 16px; padding: 18px 20px;
                cursor: pointer; text-align: left; box-shadow: 0 1px 4px rgba(0,0,0,.07);
                display: flex; align-items: center; gap: 16px; width: 100%; }
  .home-icon  { width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center;
                justify-content: center; font-size: 26px; flex-shrink: 0; }
  .home-chev  { color: #cbd5e1; font-size: 20px; margin-left: auto; }
  .home-foot  { text-align: center; padding: 24px 0 0; font-size: 11px; color: #94a3b8; }
  .pass-grid  { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
  .grid-leg   { margin-top: 10px; display: flex; gap: 14px; font-size: 10px; color: #94a3b8; }
  .form-split { display: flex; flex-direction: column; gap: 14px; }
  .f-label    { font-size: 12px; font-weight: 600; color: #374151; display: block; margin-bottom: 6px; }
  .f-group    { margin-bottom: 12px; }
  .f-input    { width: 100%; border: 1.5px solid #e2e8f0; border-radius: 10px;
                padding: 11px 12px; font-size: 15px; outline: none; font-family: inherit; color: #0f172a; }
  .f-input-err{ width: 100%; border: 1.5px solid #ef4444; border-radius: 10px;
                padding: 11px 12px; font-size: 15px; outline: none; font-family: inherit; color: #0f172a; }
  .f-err      { font-size: 12px; color: #ef4444; margin-top: 5px; }
  .type-row   { display: flex; gap: 8px; margin-bottom: 16px; }
  .type-btn   { flex: 1; border-radius: 10px; padding: 10px 8px; cursor: pointer; text-align: left; }
  .empty-hint { color: #94a3b8; font-size: 13px; padding: 8px 0; }
  .cta-btn    { border: none; border-radius: 12px; padding: 14px; font-size: 14px; font-weight: 700; width: 100%; }
  .banner-err { background: #fef2f2; border: 1.5px solid #fecaca; color: #b91c1c; border-radius: 10px;
                padding: 10px 12px; font-size: 13px; margin-bottom: 12px; }
  .success-wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 32px; }
  .success-box  { max-width: 380px; text-align: center; }

  @media (min-width: 720px) {
    .hdr        { padding: 24px 32px 32px; }
    .hdr-title  { font-size: 32px; }
    .page       { max-width: 900px; padding: 32px 24px; }
    .home-cards { flex-direction: row; }
    .home-btn   { flex: 1; flex-direction: column; align-items: flex-start; padding: 28px 24px; }
    .home-icon  { width: 60px; height: 60px; margin-bottom: 10px; }
    .home-chev  { display: none; }
    .home-btn:hover { box-shadow: 0 4px 14px rgba(0,0,0,.11); transform: translateY(-1px); transition: all .15s; }
    .form-split { flex-direction: row; align-items: flex-start; }
    .form-split .card { flex: 1; }
    .pass-grid  { grid-template-columns: repeat(8, 1fr); }
    .success-box { max-width: 520px; }
  }
`;

function PassTile({
  pass,
  selected,
  onSelect,
  mode,
}: {
  pass: UiPass;
  selected: UiPass | null;
  onSelect: (p: UiPass) => void;
  mode: "issue" | "return";
}) {
  const active =
    mode === "issue" ? pass.status === "available" : pass.status === "out";
  const isSel = selected?.id === pass.id;
  const accent = mode === "return" ? "#c2410c" : "#0f172a";
  const activeBg = mode === "return" ? "#fff7ed" : "#fff";
  const activeClr = mode === "return" ? "#c2410c" : "#0f172a";
  return (
    <button
      onClick={() => active && onSelect(pass)}
      disabled={!active}
      style={{
        border: isSel ? `2px solid ${accent}` : "1.5px solid #e2e8f0",
        borderRadius: 10,
        padding: "10px 4px",
        fontSize: 13,
        fontWeight: 700,
        cursor: active ? "pointer" : "default",
        background: isSel ? accent : active ? activeBg : "#f8fafc",
        color: isSel ? "#fff" : active ? activeClr : "#cbd5e1",
        transition: "all .12s",
      }}
    >
      {pass.id}
    </button>
  );
}

export default function ParkingApp() {
  const searchParams = useSearchParams();

  const [passes, setPasses] = useState<UiPass[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [view, setView] = useState<View>("home");
  const [sel, setSel] = useState<UiPass | null>(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    type: "occasional",
  });
  const [retEmail, setRetEmail] = useState("");
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState<Success | null>(null);
  const [deepLinkApplied, setDeepLinkApplied] = useState(false);

  const avail = useMemo(
    () => passes.filter((p) => p.status === "available"),
    [passes]
  );
  const out = useMemo(
    () => passes.filter((p) => p.status === "out"),
    [passes]
  );

  const loadPasses = useCallback(async () => {
    try {
      const json = await apiFetch<{ passes: PassWithDuration[] }>("/api/passes");
      setPasses(json.passes.map(toUiPass));
      setLoadError("");
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Failed to load passes."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPasses();
  }, [loadPasses]);

  // Deep link: /?action=return&pass=001 (used by the one-click email links)
  useEffect(() => {
    if (loading || deepLinkApplied || passes.length === 0) return;
    const action = searchParams.get("action");
    const passId = searchParams.get("pass");
    if ((action === "return" || action === "issue") && passId) {
      const match = passes.find((p) => p.id === passId.padStart(3, "0"));
      if (match) {
        setView(action);
        const selectable =
          action === "return"
            ? match.status === "out"
            : match.status === "available";
        if (selectable) setSel(match);
      } else if (action === "return" || action === "issue") {
        setView(action);
      }
    }
    setDeepLinkApplied(true);
  }, [loading, deepLinkApplied, passes, searchParams]);

  const reset = () => {
    setView("home");
    setSel(null);
    setForm({ name: "", email: "", type: "occasional" });
    setRetEmail("");
    setFormError("");
    setSuccess(null);
  };

  const pickPass = (p: UiPass) => {
    setSel(p);
    setRetEmail("");
    setFormError("");
  };

  const doIssue = async () => {
    if (!sel || !form.name.trim() || !form.email.includes("@") || submitting)
      return;
    setSubmitting(true);
    setFormError("");
    try {
      await apiFetch("/api/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          passId: sel.id,
          name: form.name.trim(),
          email: form.email.trim(),
          type: form.type,
        }),
      });
      await loadPasses();
      setSuccess({
        action: "issued",
        pass: sel.id,
        name: form.name.trim(),
        email: form.email.trim(),
      });
      setView("success");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong."
      );
      await loadPasses();
    } finally {
      setSubmitting(false);
    }
  };

  const doReturn = async () => {
    if (!sel || !retEmail.includes("@") || submitting) return;
    setSubmitting(true);
    setFormError("");
    try {
      await apiFetch("/api/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passId: sel.id, email: retEmail.trim() }),
      });
      const name = sel.holder;
      await loadPasses();
      setSuccess({ action: "returned", pass: sel.id, name });
      setView("success");
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : "Something went wrong."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const BackBtn = () => (
    <button className="back-btn" onClick={reset}>
      ← Back
    </button>
  );

  const PassGrid = ({ mode }: { mode: "issue" | "return" }) => (
    <>
      <div className="pass-grid">
        {passes.map((p) => (
          <PassTile
            key={p.id}
            pass={p}
            selected={sel}
            onSelect={pickPass}
            mode={mode}
          />
        ))}
      </div>
      <div className="grid-leg">
        {mode === "issue" ? (
          <>
            <span>
              <b style={{ color: "#0f172a" }}>White</b> = available
            </span>
            <span>Grey = taken</span>
          </>
        ) : (
          <>
            <span>
              <b style={{ color: "#c2410c" }}>Orange</b> = checked out
            </span>
            <span>Grey = in</span>
          </>
        )}
      </div>
    </>
  );

  const CtaBtn = ({
    label,
    onClick,
    active,
    color = "#0f172a",
  }: {
    label: string;
    onClick: () => void;
    active: boolean;
    color?: string;
  }) => (
    <button
      className="cta-btn"
      onClick={onClick}
      disabled={!active}
      style={{
        background: active ? color : "#e2e8f0",
        color: active ? "#fff" : "#94a3b8",
        cursor: active ? "pointer" : "default",
      }}
    >
      {label}
    </button>
  );

  const Styles = () => <style>{CSS}</style>;

  if (loading) {
    return (
      <>
        <Styles />
        <div className="app">
          <div className="hdr">
            <div className="hdr-inner">
              <div className="hdr-label">Associa British Columbia</div>
              <div className="hdr-title">Parking Passes</div>
            </div>
          </div>
          <div className="page">
            <div className="card">
              <p className="empty-hint">Loading passes…</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (view === "home")
    return (
      <>
        <Styles />
        <div className="app">
          <div className="hdr">
            <div className="hdr-inner">
              <div className="hdr-label">Associa British Columbia</div>
              <div className="hdr-title">Parking Passes</div>
              <div className="hdr-badges">
                <span className="badge-g">{avail.length} available</span>
                <span className="badge-o">{out.length} checked out</span>
              </div>
            </div>
          </div>
          <div className="page">
            {loadError && <div className="banner-err">{loadError}</div>}
            <div className="home-cards">
              {[
                {
                  mode: "issue" as const,
                  icon: "🅿️",
                  title: "Take a pass",
                  sub: "Check out a parking pass",
                  bg: "#f0fdf4",
                },
                {
                  mode: "return" as const,
                  icon: "↩️",
                  title: "Return a pass",
                  sub: "Hand back a pass you have",
                  bg: "#fff7ed",
                },
              ].map(({ mode, icon, title, sub, bg }) => (
                <button
                  key={mode}
                  className="home-btn"
                  onClick={() => setView(mode)}
                >
                  <div className="home-icon" style={{ background: bg }}>
                    {icon}
                  </div>
                  <div>
                    <div
                      style={{
                        fontSize: 16,
                        fontWeight: 700,
                        color: "#0f172a",
                        marginBottom: 2,
                      }}
                    >
                      {title}
                    </div>
                    <div style={{ fontSize: 13, color: "#64748b" }}>{sub}</div>
                  </div>
                  <span className="home-chev">›</span>
                </button>
              ))}
            </div>
            <div className="home-foot">
              Scan the QR code at reception · or open this link on any device
            </div>
          </div>
        </div>
      </>
    );

  if (view === "issue") {
    const valid =
      !!sel && !!form.name.trim() && form.email.includes("@") && !submitting;
    return (
      <>
        <Styles />
        <div className="app">
          <div className="hdr">
            <div className="hdr-inner">
              <BackBtn />
              <div className="hdr-title">Take a pass</div>
              <div className="hdr-sub">
                Pick your pass number, then fill in your details
              </div>
            </div>
          </div>
          <div className="page">
            <div className="form-split">
              <div className="card">
                <div className="card-label">Select your pass number</div>
                <PassGrid mode="issue" />
              </div>
              <div className="card">
                {!sel ? (
                  <p className="empty-hint">Select a pass to continue.</p>
                ) : (
                  <>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#0f172a",
                        marginBottom: 14,
                      }}
                    >
                      Pass {sel.id} — your details
                    </div>
                    {formError && (
                      <div className="banner-err">{formError}</div>
                    )}
                    <div className="f-group">
                      <label className="f-label">Full name</label>
                      <input
                        className="f-input"
                        type="text"
                        placeholder="e.g. Maria Lopez"
                        value={form.name}
                        onChange={(e) =>
                          setForm({ ...form, name: e.target.value })
                        }
                      />
                    </div>
                    <div className="f-group">
                      <label className="f-label">Work email</label>
                      <input
                        className="f-input"
                        type="email"
                        placeholder="you@associabc.com"
                        value={form.email}
                        onChange={(e) =>
                          setForm({ ...form, email: e.target.value })
                        }
                      />
                    </div>
                    <label className="f-label">
                      How often do you come in?
                    </label>
                    <div className="type-row">
                      {[
                        {
                          v: "regular" as const,
                          label: "Daily",
                          desc: "Every workday",
                        },
                        {
                          v: "occasional" as const,
                          label: "Occasional",
                          desc: "A few times a week",
                        },
                      ].map(({ v, label, desc }) => (
                        <button
                          key={v}
                          className="type-btn"
                          onClick={() => setForm({ ...form, type: v })}
                          style={{
                            border:
                              form.type === v
                                ? "2px solid #0f172a"
                                : "1.5px solid #e2e8f0",
                            background: form.type === v ? "#f8fafc" : "#fff",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: "#0f172a",
                            }}
                          >
                            {label}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#94a3b8",
                              marginTop: 2,
                            }}
                          >
                            {desc}
                          </div>
                        </button>
                      ))}
                    </div>
                    <CtaBtn
                      label={
                        submitting
                          ? "Checking out…"
                          : `Confirm — take pass ${sel.id}`
                      }
                      onClick={doIssue}
                      active={valid}
                    />
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (view === "return") {
    const canSubmit = !!sel && retEmail.includes("@") && !submitting;
    return (
      <>
        <Styles />
        <div className="app">
          <div className="hdr">
            <div className="hdr-inner">
              <BackBtn />
              <div className="hdr-title">Return a pass</div>
              <div className="hdr-sub">
                Select the pass you&apos;re handing back
              </div>
            </div>
          </div>
          <div className="page">
            {out.length === 0 ? (
              <div
                className="card"
                style={{ textAlign: "center", padding: 40 }}
              >
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#0f172a",
                  }}
                >
                  All passes are in
                </div>
                <div
                  style={{ fontSize: 13, color: "#64748b", marginTop: 4 }}
                >
                  Nothing to return right now.
                </div>
              </div>
            ) : (
              <div className="form-split">
                <div className="card">
                  <div className="card-label">
                    Which pass are you returning?
                  </div>
                  <PassGrid mode="return" />
                </div>
                <div className="card">
                  {!sel ? (
                    <p className="empty-hint">Select a pass to continue.</p>
                  ) : (
                    <>
                      <div
                        style={{
                          fontSize: 13,
                          color: "#64748b",
                          marginBottom: 14,
                        }}
                      >
                        Pass {sel.id} is checked out to{" "}
                        <b style={{ color: "#0f172a" }}>
                          {sel.holder || "someone"}
                        </b>
                      </div>
                      <div className="f-group">
                        <label className="f-label">Confirm your email</label>
                        <input
                          className={formError ? "f-input-err" : "f-input"}
                          type="email"
                          placeholder="The email you used when checking out"
                          value={retEmail}
                          onChange={(e) => {
                            setRetEmail(e.target.value);
                            setFormError("");
                          }}
                        />
                        {formError && (
                          <div className="f-err">{formError}</div>
                        )}
                      </div>
                      <CtaBtn
                        label={
                          submitting
                            ? "Returning…"
                            : `Return pass ${sel.id}`
                        }
                        onClick={doReturn}
                        active={canSubmit}
                        color="#c2410c"
                      />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  if (view === "success") {
    const issued = success?.action === "issued";
    return (
      <>
        <Styles />
        <div
          className="app"
          style={{ background: issued ? "#f0fdf4" : "#fff7ed" }}
        >
          <div className="success-wrap">
            <div className="success-box">
              <div style={{ fontSize: 64, marginBottom: 16 }}>
                {issued ? "✅" : "🎉"}
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 800,
                  color: "#0f172a",
                  letterSpacing: "-0.5px",
                  marginBottom: 10,
                }}
              >
                {issued
                  ? `Pass ${success?.pass} is yours`
                  : `Pass ${success?.pass} returned`}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: "#475569",
                  lineHeight: 1.7,
                  marginBottom: 36,
                }}
              >
                {issued && success?.action === "issued"
                  ? `A confirmation has been sent to ${success.email}. Please return the pass when you're done.`
                  : success?.action === "returned"
                  ? `Thanks ${
                      success.name?.split(" ")[0] || "very much"
                    }! The pass is available again.`
                  : ""}
              </div>
              <button
                onClick={reset}
                style={{
                  background: "#0f172a",
                  color: "#fff",
                  border: "none",
                  borderRadius: 14,
                  padding: "14px 36px",
                  fontSize: 15,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  return null;
}

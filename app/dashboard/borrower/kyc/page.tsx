"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, Clock, XCircle, Shield, Upload, ChevronRight, AlertTriangle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

type KycStatus = "NEEDS_INFO" | "PROCESSING" | "ACCEPTED" | "REJECTED";
type Step = "status" | "personal" | "document" | "review" | "done";

interface PrefillData {
  first_name: string;
  last_name: string;
  birth_date: string | null;
  country_code: string | null;
  phone_number: string | null;
  has_id_document: boolean;
}

interface SessionData {
  status: KycStatus;
  kyc_tier: number;
  prefill: PrefillData;
  rejection_reason: string | null;
  kyc_submitted_at: string | null;
}

interface FormState {
  first_name: string;
  last_name: string;
  birth_date: string;
  country_code: string;
  phone_number: string;
  photo_id_front: string;
}

// ─── Status display config ────────────────────────────────────────────────────

const STATUS_CONFIG: Record<KycStatus, { icon: React.ReactNode; color: string; bg: string; label: string }> = {
  ACCEPTED: {
    icon: <CheckCircle size={40} />, color: "#22cf9d", bg: "rgba(34,207,157,0.1)",
    label: "Identity Verified"
  },
  PROCESSING: {
    icon: <Clock size={40} />, color: "#f59e0b", bg: "rgba(245,158,11,0.1)",
    label: "Under Review"
  },
  REJECTED: {
    icon: <XCircle size={40} />, color: "#ef4444", bg: "rgba(239,68,68,0.1)",
    label: "Verification Failed"
  },
  NEEDS_INFO: {
    icon: <Shield size={40} />, color: "#818cf8", bg: "rgba(129,140,248,0.1)",
    label: "Verify Identity"
  },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function KycPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<SessionData | null>(null);
  const [step, setStep] = useState<Step>("status");
  const [form, setForm] = useState<FormState>({
    first_name: "", last_name: "", birth_date: "",
    country_code: "", phone_number: "", photo_id_front: "",
  });

  // ── Fetch KYC session on mount ──────────────────────────────────────────────
  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch("/api/kyc/start", { method: "POST" });
      if (!res.ok) throw new Error("Failed to load KYC status");
      const data: SessionData = await res.json();
      setSession(data);
      // Pre-fill form from server data
      setForm(prev => ({
        ...prev,
        first_name: data.prefill.first_name || "",
        last_name: data.prefill.last_name || "",
        birth_date: data.prefill.birth_date || "",
        country_code: data.prefill.country_code || "",
        phone_number: data.prefill.phone_number || "",
      }));
      // Jump to done step if already verified/processing
      if (data.status === "ACCEPTED" || data.status === "PROCESSING") {
        setStep("done");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  // ── Handle file upload (convert to data URL for now) ──────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setForm(prev => ({ ...prev, photo_id_front: reader.result as string }));
    };
    reader.readAsDataURL(file);
  };

  // ── Submit KYC via SEP-12 PUT ──────────────────────────────────────────────
  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/kyc/customer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          birth_date: form.birth_date,
          country_code: form.country_code,
          phone_number: form.phone_number || undefined,
          photo_id_front: form.photo_id_front || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Submission failed");
      setStep("done");
      setSession(prev => prev ? { ...prev, status: "PROCESSING" } : prev);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Loading state ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
        <div style={{ textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ width: 40, height: 40, border: "3px solid rgba(99,102,241,0.3)", borderTopColor: "#818cf8", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 1rem" }} />
          <p>Loading KYC status…</p>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[session?.status ?? "NEEDS_INFO"];

  // ── Status / Done view ─────────────────────────────────────────────────────
  if (step === "done") {
    return (
      <div style={{ maxWidth: 560, margin: "0 auto", padding: "3rem 1.5rem", textAlign: "center" }}>
        <div style={{
          width: 80, height: 80, borderRadius: "50%",
          background: cfg.bg, color: cfg.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 1.5rem",
        }}>
          {cfg.icon}
        </div>
        <h1 style={{ fontSize: "1.75rem", fontWeight: 800, marginBottom: "0.5rem", color: "var(--text-primary)" }}>
          {cfg.label}
        </h1>

        {session?.status === "ACCEPTED" && (
          <>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Your identity has been verified. You can now access all Kredex borrowing tiers.
            </p>
            <div style={{ display: "inline-flex", gap: "0.5rem", flexWrap: "wrap", justifyContent: "center", marginBottom: "2rem" }}>
              {[
                { label: "KYC Tier", value: `Tier ${session.kyc_tier}`, color: "#22cf9d" },
                { label: "Status", value: "ACCEPTED", color: "#22cf9d" },
                { label: "Standard", value: "SEP-12", color: "#818cf8" },
              ].map(b => (
                <span key={b.label} style={{
                  padding: "0.35rem 0.85rem", borderRadius: "9999px",
                  fontSize: "0.8rem", fontWeight: 700,
                  background: `${b.color}20`, color: b.color, border: `1px solid ${b.color}40`,
                }}>
                  {b.label}: {b.value}
                </span>
              ))}
            </div>
            <button
              onClick={() => router.push("/dashboard/borrower")}
              style={{
                padding: "0.75rem 2rem", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #6366f1, #14b8a6)",
                color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "1rem",
              }}
            >
              Go to Dashboard
            </button>
          </>
        )}

        {session?.status === "PROCESSING" && (
          <>
            <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem" }}>
              Your documents are under review. We&apos;ll notify you within 1–2 business days.
            </p>
            {session.kyc_submitted_at && (
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "2rem" }}>
                Submitted: {new Date(session.kyc_submitted_at).toLocaleDateString("en-US", { dateStyle: "long" })}
              </p>
            )}
            <button
              onClick={() => router.push("/dashboard/borrower")}
              style={{
                padding: "0.75rem 2rem", borderRadius: 10, border: "1px solid var(--border)",
                background: "var(--bg-card)", color: "var(--text-primary)", fontWeight: 700, cursor: "pointer", fontSize: "1rem",
              }}
            >
              Back to Dashboard
            </button>
          </>
        )}

        {session?.status === "REJECTED" && (
          <>
            {session.rejection_reason && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "1rem", marginBottom: "1.5rem", textAlign: "left" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                  <AlertTriangle size={16} style={{ color: "#ef4444", marginTop: 2, flexShrink: 0 }} />
                  <p style={{ color: "#ef4444", fontSize: "0.875rem", margin: 0 }}>{session.rejection_reason}</p>
                </div>
              </div>
            )}
            <button
              onClick={() => { setStep("personal"); setSession(prev => prev ? { ...prev, status: "NEEDS_INFO" } : prev); }}
              style={{
                padding: "0.75rem 2rem", borderRadius: 10, border: "none",
                background: "linear-gradient(135deg, #6366f1, #14b8a6)",
                color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: "1rem",
              }}
            >
              Re-submit KYC
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Step indicator ─────────────────────────────────────────────────────────
  const steps = [
    { id: "personal", label: "Personal Info" },
    { id: "document", label: "ID Document" },
    { id: "review",   label: "Review" },
  ];

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: "2rem 1.5rem" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "2.5rem" }}>
        <div style={{
          width: 64, height: 64, borderRadius: "50%",
          background: cfg.bg, color: cfg.color,
          display: "flex", alignItems: "center", justifyContent: "center",
          margin: "0 auto 1rem",
        }}>
          {cfg.icon}
        </div>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.4rem", color: "var(--text-primary)" }}>
          Identity Verification
        </h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Verify once, reusable across all Stellar anchors (SEP-12)
        </p>
        <div style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.15)", borderRadius: "0.5rem", padding: "0.75rem", marginTop: "1rem", display: "inline-flex", alignItems: "center", gap: "0.5rem", textAlign: "left" }}>
           <Shield size={16} style={{ color: "#ef4444", flexShrink: 0 }} />
           <p style={{ color: "var(--text-secondary)", fontSize: "0.8rem", margin: 0, lineHeight: 1.4 }}>
             <strong>Strict KYC Enforcement:</strong> To protect our lenders and prevent scams, all IDs undergo manual verification and biometric checking. Fraudulent submissions will result in an immediate permanent ban.
           </p>
        </div>
      </div>

      {/* Step progress */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem", marginBottom: "2rem" }}>
        {steps.map((s, i) => {
          const isDone = steps.findIndex(x => x.id === step) > i;
          const isActive = s.id === step;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: isDone ? "#22cf9d" : isActive ? "#6366f1" : "var(--bg-card)",
                  border: `2px solid ${isDone ? "#22cf9d" : isActive ? "#6366f1" : "var(--border)"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.8rem", fontWeight: 700, color: isDone || isActive ? "#fff" : "var(--text-muted)",
                  transition: "all 0.2s",
                }}>
                  {isDone ? "✓" : i + 1}
                </div>
                <span style={{ fontSize: "0.7rem", marginTop: "0.25rem", color: isActive ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <div style={{ width: 40, height: 2, background: isDone ? "#22cf9d" : "var(--border)", marginBottom: 18, transition: "background 0.2s" }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── Step: Personal Info ─────────────────────────────────────────────── */}
      {(step === "status" || step === "personal") && (
        <div className="workspace-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>Personal Information</h2>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
            <div>
              <label className="workspace-label">First Name *</label>
              <input
                className="workspace-input"
                value={form.first_name}
                onChange={e => setForm(p => ({ ...p, first_name: e.target.value }))}
                placeholder="Jane"
                required
              />
            </div>
            <div>
              <label className="workspace-label">Last Name *</label>
              <input
                className="workspace-input"
                value={form.last_name}
                onChange={e => setForm(p => ({ ...p, last_name: e.target.value }))}
                placeholder="Doe"
                required
              />
            </div>
          </div>

          <div>
            <label className="workspace-label">Date of Birth *</label>
            <input
              type="date"
              className="workspace-input"
              value={form.birth_date}
              onChange={e => setForm(p => ({ ...p, birth_date: e.target.value }))}
              max={new Date(Date.now() - 18 * 365.25 * 86400000).toISOString().split("T")[0]}
            />
          </div>

          <div>
            <label className="workspace-label">Country of Residence *</label>
            <input
              className="workspace-input"
              value={form.country_code}
              onChange={e => setForm(p => ({ ...p, country_code: e.target.value.toUpperCase().slice(0, 2) }))}
              placeholder="US, IN, GB…"
              maxLength={2}
            />
            <p className="workspace-hint">ISO 3166-1 alpha-2 country code</p>
          </div>

          <div>
            <label className="workspace-label">Phone Number <span style={{ opacity: 0.5 }}>(optional)</span></label>
            <input
              className="workspace-input"
              value={form.phone_number}
              onChange={e => setForm(p => ({ ...p, phone_number: e.target.value }))}
              placeholder="+1 555 000 0000"
            />
          </div>

          {error && <p className="workspace-error">{error}</p>}

          <button
            className="workspace-button workspace-button--primary"
            onClick={() => {
              if (!form.first_name || !form.last_name || !form.birth_date || !form.country_code) {
                setError("Please fill in all required fields.");
                return;
              }
              setError(null);
              setStep("document");
            }}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
          >
            Continue <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* ── Step: ID Document ───────────────────────────────────────────────── */}
      {step === "document" && (
        <div className="workspace-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>Government-Issued ID</h2>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            Upload the front of your passport, national ID, or driver&apos;s licence.
          </p>

          <label
            htmlFor="id-upload"
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              gap: "0.75rem", padding: "2rem", border: "2px dashed var(--border)",
              borderRadius: 12, cursor: "pointer", transition: "border-color 0.2s",
              background: form.photo_id_front ? "rgba(34,207,157,0.05)" : "var(--bg-surface)",
              borderColor: form.photo_id_front ? "#22cf9d" : "var(--border)",
            }}
          >
            {form.photo_id_front ? (
              <>
                <CheckCircle size={32} color="#22cf9d" />
                <span style={{ color: "#22cf9d", fontWeight: 600 }}>Document uploaded ✓</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Click to replace</span>
              </>
            ) : (
              <>
                <Upload size={32} color="var(--text-muted)" />
                <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>Click to upload</span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>JPG, PNG or PDF · Max 10 MB</span>
              </>
            )}
            <input id="id-upload" type="file" accept="image/*,.pdf" onChange={handleFileChange} style={{ display: "none" }} />
          </label>

          {!form.photo_id_front && session?.prefill.has_id_document && (
            <div style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", borderRadius: 8, padding: "0.75rem 1rem", fontSize: "0.8rem", color: "#f59e0b" }}>
              You have a document on file from a previous submission. You can re-upload to replace it or continue without changing it.
            </div>
          )}

          {error && <p className="workspace-error">{error}</p>}

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              className="workspace-button"
              onClick={() => setStep("personal")}
              style={{ flex: 1 }}
            >
              Back
            </button>
            <button
              className="workspace-button workspace-button--primary"
              onClick={() => {
                if (!form.photo_id_front && !session?.prefill.has_id_document) {
                  setError("Please upload your government ID.");
                  return;
                }
                setError(null);
                setStep("review");
              }}
              style={{ flex: 2, display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
            >
              Review & Submit <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── Step: Review ────────────────────────────────────────────────────── */}
      {step === "review" && (
        <div className="workspace-card" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <h2 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0 }}>Review & Submit</h2>

          <div style={{ background: "var(--bg-surface)", borderRadius: 10, padding: "1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {[
              { label: "Name", value: `${form.first_name} ${form.last_name}` },
              { label: "Date of Birth", value: form.birth_date || "—" },
              { label: "Country", value: form.country_code || "—" },
              { label: "Phone", value: form.phone_number || "Not provided" },
              { label: "Government ID", value: form.photo_id_front ? "Uploaded ✓" : session?.prefill.has_id_document ? "On file ✓" : "Not provided" },
            ].map(row => (
              <div key={row.label} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.875rem" }}>
                <span style={{ color: "var(--text-muted)" }}>{row.label}</span>
                <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{row.value}</span>
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: 8, padding: "0.75rem 1rem", fontSize: "0.8rem", color: "#818cf8" }}>
            <strong>SEP-12 Compliance:</strong> Your information is stored securely on Kredex servers and is never shared without your consent. KYC approval by Kredex is recognised by any compliant Stellar anchor.
          </div>

          {error && <p className="workspace-error">{error}</p>}

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              className="workspace-button"
              onClick={() => setStep("document")}
              style={{ flex: 1 }}
              disabled={submitting}
            >
              Back
            </button>
            <button
              className="workspace-button workspace-button--primary"
              onClick={handleSubmit}
              disabled={submitting}
              style={{ flex: 2 }}
            >
              {submitting ? "Submitting…" : "Submit for Review"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

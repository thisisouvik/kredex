"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle, XCircle, Clock, Send, RefreshCw, ExternalLink } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Loan {
  id: string;
  principal_amount: number;
  status: string;
  borrower_address: string;
  full_name: string | null;
}

interface BatchResult {
  batchIndex: number;
  status: "success" | "failed";
  txHash: string | null;
  count: number;
  error?: string;
}

interface AuditRecord {
  id: string;
  loan_id: string;
  borrower_address: string;
  amount_xlm: number;
  batch_index: number;
  tx_hash: string | null;
  status: string;
  error_message: string | null;
  attempted_at: string;
}

const EXPLORER_BASE =
  process.env.NEXT_PUBLIC_STELLAR_NETWORK === "mainnet"
    ? "https://stellar.expert/explorer/public/tx/"
    : "https://stellar.expert/explorer/testnet/tx/";

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminDisbursePage() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [disbursing, setDisbursing] = useState(false);
  const [results, setResults] = useState<BatchResult[]>([]);
  const [summary, setSummary] = useState<{ successBatches: number; failedBatches: number; durationMs: number } | null>(null);
  const [auditLog, setAuditLog] = useState<AuditRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch approved loans ────────────────────────────────────────────────────
  const fetchLoans = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/loans?status=approved&limit=500");
      if (!res.ok) throw new Error("Failed to fetch loans");
      const data = await res.json() as { loans: Loan[] };
      setLoans(data.loans ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load loans");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchAuditLog = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/disburse?limit=30");
      if (!res.ok) return;
      const data = await res.json() as { records: AuditRecord[] };
      setAuditLog(data.records ?? []);
    } catch {}
  }, []);

  useEffect(() => {
    fetchLoans();
    fetchAuditLog();
  }, [fetchLoans, fetchAuditLog]);

  // ── Selection helpers ───────────────────────────────────────────────────────
  const toggleAll = () => {
    if (selected.size === loans.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(loans.map((l) => l.id)));
    }
  };

  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  // ── Disburse ────────────────────────────────────────────────────────────────
  const handleDisburse = async () => {
    if (selected.size === 0) return;
    setDisbursing(true);
    setResults([]);
    setSummary(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/disburse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanIds: Array.from(selected) }),
      });
      const data = await res.json() as {
        summary?: typeof summary;
        batches?: BatchResult[];
        error?: string;
      };

      if (!res.ok) throw new Error(data.error ?? "Disbursement failed");

      setResults(data.batches ?? []);
      setSummary(data.summary ?? null);
      await fetchLoans();
      await fetchAuditLog();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Disbursement failed");
    } finally {
      setDisbursing(false);
    }
  };

  const totalXlm = loans
    .filter((l) => selected.has(l.id))
    .reduce((s, l) => s + Number(l.principal_amount) / 10_000_000, 0);

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "2rem", maxWidth: 1100, margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, margin: 0 }}>
            Batch Disbursement
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: "0.25rem 0 0" }}>
            Stellar Disbursement Platform · Up to 500 borrowers · 100 ops/tx
          </p>
        </div>
        <button
          onClick={() => { fetchLoans(); fetchAuditLog(); }}
          style={{ padding: "0.5rem", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-card)", cursor: "pointer", color: "var(--text-muted)" }}
          title="Refresh"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* ── Loans table ── */}
      <div className="workspace-card workspace-card--full">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 className="workspace-card-title" style={{ margin: 0 }}>
            Approved Loans ({loans.length})
          </h2>
          {selected.size > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                {selected.size} selected · {totalXlm.toFixed(2)} XLM
              </span>
              <button
                onClick={handleDisburse}
                disabled={disbursing}
                style={{
                  padding: "0.5rem 1.25rem", borderRadius: 8, border: "none",
                  background: "linear-gradient(135deg, #6366f1, #14b8a6)",
                  color: "#fff", fontWeight: 700, cursor: disbursing ? "not-allowed" : "pointer",
                  display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.875rem",
                  opacity: disbursing ? 0.7 : 1,
                }}
              >
                <Send size={14} />
                {disbursing ? "Disbursing…" : `Disburse ${selected.size}`}
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>Loading approved loans…</p>
        ) : loans.length === 0 ? (
          <p style={{ color: "var(--text-muted)", textAlign: "center", padding: "2rem" }}>
            No APPROVED loans pending disbursement.
          </p>
        ) : (
          <div className="workspace-table-wrap">
            <table className="workspace-table" aria-label="Approved loans for disbursement">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={selected.size === loans.length && loans.length > 0}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Borrower</th>
                  <th>Wallet</th>
                  <th>Amount (XLM)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {loans.map((loan) => (
                  <tr key={loan.id} style={{ opacity: selected.has(loan.id) ? 1 : 0.7 }}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(loan.id)}
                        onChange={() => toggleOne(loan.id)}
                        aria-label={`Select loan ${loan.id}`}
                      />
                    </td>
                    <td>
                      <span style={{ fontWeight: 600 }}>{loan.full_name ?? "Unknown"}</span>
                      <br />
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{loan.id.slice(0, 8)}…</span>
                    </td>
                    <td>
                      <code style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {loan.borrower_address
                          ? `${loan.borrower_address.slice(0, 8)}…${loan.borrower_address.slice(-4)}`
                          : "—"}
                      </code>
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {(Number(loan.principal_amount) / 10_000_000).toFixed(2)} XLM
                    </td>
                    <td>
                      <span style={{
                        padding: "0.15rem 0.5rem", borderRadius: 9999, fontSize: "0.7rem", fontWeight: 700,
                        background: "rgba(245,158,11,0.12)", color: "#f59e0b",
                      }}>
                        APPROVED
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: 10, padding: "1rem 1.25rem", color: "#ef4444", fontSize: "0.875rem" }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Batch results ── */}
      {results.length > 0 && (
        <div className="workspace-card workspace-card--full">
          <h2 className="workspace-card-title">
            Disbursement Results
            {summary && (
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginLeft: "0.75rem", fontWeight: 400 }}>
                {summary.successBatches}/{results.length} batches succeeded · {(summary.durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            {results.map((b) => (
              <div
                key={b.batchIndex}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "0.75rem 1rem", borderRadius: 8,
                  background: b.status === "success" ? "rgba(34,207,157,0.06)" : "rgba(239,68,68,0.06)",
                  border: `1px solid ${b.status === "success" ? "rgba(34,207,157,0.15)" : "rgba(239,68,68,0.15)"}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                  {b.status === "success"
                    ? <CheckCircle size={18} color="#22cf9d" />
                    : <XCircle size={18} color="#ef4444" />}
                  <div>
                    <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>
                      Batch {b.batchIndex + 1} · {b.count} payments
                    </span>
                    {b.error && (
                      <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "#ef4444" }}>{b.error}</p>
                    )}
                  </div>
                </div>
                {b.txHash && (
                  <a
                    href={`${EXPLORER_BASE}${b.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.75rem", color: "#22cf9d", textDecoration: "none" }}
                  >
                    {b.txHash.slice(0, 12)}… <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Audit log ── */}
      {auditLog.length > 0 && (
        <div className="workspace-card workspace-card--full">
          <h2 className="workspace-card-title">Disbursement Audit Log</h2>
          <div className="workspace-table-wrap">
            <table className="workspace-table" aria-label="Disbursement audit log">
              <thead>
                <tr>
                  <th>Loan ID</th>
                  <th>Borrower</th>
                  <th>Amount XLM</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Tx Hash</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {auditLog.map((r) => (
                  <tr key={r.id}>
                    <td><code style={{ fontSize: "0.75rem" }}>{r.loan_id.slice(0, 8)}…</code></td>
                    <td><code style={{ fontSize: "0.75rem" }}>{r.borrower_address.slice(0, 8)}…</code></td>
                    <td>{r.amount_xlm.toFixed(2)}</td>
                    <td style={{ textAlign: "center" }}>#{r.batch_index}</td>
                    <td>
                      <span style={{
                        display: "inline-flex", alignItems: "center", gap: "0.25rem",
                        padding: "0.1rem 0.4rem", borderRadius: 9999, fontSize: "0.7rem", fontWeight: 700,
                        background: r.status === "success" ? "rgba(34,207,157,0.1)" : r.status === "pending" ? "rgba(245,158,11,0.1)" : "rgba(239,68,68,0.1)",
                        color: r.status === "success" ? "#22cf9d" : r.status === "pending" ? "#f59e0b" : "#ef4444",
                      }}>
                        {r.status === "success" ? <CheckCircle size={10} /> : r.status === "pending" ? <Clock size={10} /> : <XCircle size={10} />}
                        {r.status.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      {r.tx_hash ? (
                        <a href={`${EXPLORER_BASE}${r.tx_hash}`} target="_blank" rel="noopener noreferrer"
                           style={{ fontSize: "0.75rem", color: "#22cf9d" }}>
                          {r.tx_hash.slice(0, 10)}…
                        </a>
                      ) : "—"}
                    </td>
                    <td style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                      {new Date(r.attempted_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

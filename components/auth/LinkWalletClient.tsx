"use client";

import { useState } from "react";
import { Monitor, ShieldCheck, AlertTriangle } from "lucide-react";
import { isConnected, setAllowed, getAddress } from "@stellar/freighter-api";

export function LinkWalletClient({ userId }: { userId: string }) {
    const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "error" | "success"; text: string } | null>(null);

  const handleLinkFreighter = async () => {
    setIsLoading(true);
    setMessage(null);
    try {
      const connected = await isConnected();
      if (!connected) throw new Error("Freighter not installed.");
      
      await setAllowed();
      const { address, error } = await getAddress();
      if (error) throw new Error(error);

      // Call the API to link
      const res = await fetch("/api/auth/link-wallet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, walletAddress: address }),
      });
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Linking failed");
      
      setMessage({ type: "success", text: "Wallet linked! Redirecting..." });
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 1000);
      
    } catch (err: unknown) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to link wallet" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main className="auth-page-shell">
      <div className="auth-page-card glass-panel" style={{ textAlign: "center" }}>
        <h1 className="heading-xl" style={{ marginBottom: "0.5rem" }}>Link your Wallet</h1>
        <p className="text-secondary" style={{ marginBottom: "2rem" }}>
          Your old account needs a Web3 Wallet to interact with the KRedex platform.
        </p>

        {message && (
          <div style={{ marginBottom: "1.5rem", padding: "1rem", borderRadius: "8px", background: message.type === "error" ? "rgba(239,68,68,0.1)" : "rgba(34,207,157,0.1)", color: message.type === "error" ? "#ef4444" : "#16a07a", border: `1px solid ${message.type === "error" ? "rgba(239,68,68,0.3)" : "rgba(34,207,157,0.3)"}` }}>
            {message.type === "error" ? <AlertTriangle size={18} style={{ display: "inline", marginRight: "0.5rem" }} /> : <ShieldCheck size={18} style={{ display: "inline", marginRight: "0.5rem" }} />}
            {message.text}
          </div>
        )}

        <button
          onClick={handleLinkFreighter}
          disabled={isLoading}
          className="btn btn-outline"
          style={{ padding: "1rem", width: "100%", justifyContent: "center", gap: "0.75rem" }}
        >
          <Monitor size={20} /> 
          <span style={{ fontWeight: 600 }}>{isLoading ? "Linking..." : "Connect Freighter Wallet"}</span>
        </button>
      </div>
    </main>
  );
}

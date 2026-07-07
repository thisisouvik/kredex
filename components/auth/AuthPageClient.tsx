"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck, Smartphone, Monitor, Wallet } from "lucide-react";
import albedo from "@albedo-link/intent";
import {
  isConnected,
  setAllowed,
  getAddress,
  signMessage
} from "@stellar/freighter-api";

export function AuthPageClient() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [activeWallet, setActiveWallet] = useState<"freighter" | "albedo" | null>(null);
  const [message, setMessage] = useState<{ type: "error" | "info" | "success"; text: string } | null>(null);

  const handleWalletLogin = async (walletType: "freighter" | "albedo") => {
    setIsLoading(true);
    setActiveWallet(walletType);
    setMessage(null);

    try {
      let walletAddress = "";
      
      // 1. Get Wallet Address
      if (walletType === "freighter") {
        if (!(await isConnected())) {
          setMessage({ type: "error", text: "Freighter is not installed or locked." });
          setIsLoading(false);
          setActiveWallet(null);
          return;
        }
        await setAllowed();
        const addressRes = await getAddress();
        if (addressRes.error) throw new Error(addressRes.error);
        walletAddress = addressRes.address;
      } else {
        // Albedo works great on mobile web
        const res = await albedo.publicKey({});
        walletAddress = res.pubkey;
      }

      if (!walletAddress) {
        throw new Error("Failed to get wallet address");
      }

      // 2. Fetch Challenge Nonce
      const challengeRes = await fetch("/api/auth/challenge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });

      const challengeData = await challengeRes.json();
      if (!challengeRes.ok) throw new Error(challengeData.error || "Failed to get auth challenge");

      const nonce = challengeData.nonce;

      // 3. Sign the Nonce
      let signatureBase64 = "";

      if (walletType === "freighter") {
        try {
          const signRes = await signMessage(nonce);
          signatureBase64 = typeof signRes === 'string' ? signRes : (signRes as any).signature || Buffer.from((signRes as any).signature).toString('base64');
        } catch (e: any) {
          console.error("Freighter signing error:", e);
          throw new Error("Failed to sign message with Freighter. " + (e.message || ""));
        }
      } else {
        const signRes = await albedo.signMessage({
          message: nonce,
          pubkey: walletAddress
        });
        signatureBase64 = signRes.message_signature;
      }

      // 4. Verify Signature & Issue JWT
      const verifyRes = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress, signature: signatureBase64 }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || "Signature verification failed");

      // 5. Success! Navigate to unified dashboard
      router.push("/dashboard");

    } catch (err: any) {
      console.error(err);
      setMessage({ type: "error", text: err.message || "An unexpected error occurred." });
    } finally {
      setIsLoading(false);
      setActiveWallet(null);
    }
  };

  return (
    <main className="auth-page-shell">
      <div className="auth-page-card glass-panel" style={{ textAlign: "center" }}>
        
        <div className="auth-header" style={{ marginBottom: "2rem" }}>
          <div
            className="role-badge"
            style={{ backgroundColor: `var(--accent-alpha)`, color: "var(--accent)", margin: "0 auto 1rem auto" }}
          >
            <Wallet size={16} /> Web3 Login
          </div>
          <h1 className="heading-xl">Connect Wallet</h1>
          <p className="text-secondary">Sign in securely with your Stellar wallet</p>
        </div>

        {message && (
          <div className={`auth-alert auth-alert--${message.type}`} style={{ textAlign: "left" }}>
            {message.type === "error" && <ShieldCheck size={18} />}
            <span>{message.text}</span>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <button
            className="btn btn-primary"
            style={{ padding: "1.2rem", fontSize: "1.1rem", justifyContent: "center", gap: "1rem" }}
            onClick={() => handleWalletLogin("freighter")}
            disabled={isLoading}
          >
            {isLoading && activeWallet === "freighter" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Monitor size={20} />
            )}
            Connect Freighter (Desktop)
          </button>

          <button
            className="btn btn-outline"
            style={{ padding: "1.2rem", fontSize: "1.1rem", justifyContent: "center", gap: "1rem" }}
            onClick={() => handleWalletLogin("albedo")}
            disabled={isLoading}
          >
            {isLoading && activeWallet === "albedo" ? (
              <Loader2 className="animate-spin" />
            ) : (
              <Smartphone size={20} />
            )}
            Connect Albedo (Mobile Friendly)
          </button>
        </div>

        <p className="text-secondary text-sm" style={{ textAlign: "center", marginTop: "2rem" }}>
          By connecting your wallet, you agree to our Terms of Service. No passwords required.
        </p>
      </div>
    </main>
  );
}

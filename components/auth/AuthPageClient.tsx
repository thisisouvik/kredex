"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2, ShieldCheck, Smartphone, Monitor, Fingerprint,
  Wallet, ChevronRight, AlertTriangle
} from "lucide-react";
import albedo from "@albedo-link/intent";
import {
  isConnected,
  setAllowed,
  getAddress,
  signMessage,
} from "@stellar/freighter-api";
import {
  isPasskeySupported,
  registerPasskey,
  authenticatePasskey,
  getStoredCredentialId,
} from "@/lib/wallet/passkey";

type WalletOption = "freighter" | "albedo" | "passkey";

interface AuthMessage {
  type: "error" | "info" | "success";
  text: string;
}

export function AuthPageClient() {
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(false);
  const [activeWallet, setActiveWallet] = useState<WalletOption | null>(null);
  const [message, setMessage] = useState<AuthMessage | null>(null);
  const [passkeyAvailable, setPasskeyAvailable] = useState(false);
  const [hasExistingPasskey, setHasExistingPasskey] = useState(false);

  // Check passkey support on mount
  useEffect(() => {
    isPasskeySupported().then((supported) => {
      setPasskeyAvailable(supported);
      if (supported) {
        setHasExistingPasskey(!!getStoredCredentialId());
      }
    });
  }, []);

  // ── Core Auth Flow ──────────────────────────────────────────────────────────
  const runAuthFlow = async (walletAddress: string, walletType: WalletOption, extraBody?: object) => {
    // 1. Get challenge nonce
    const challengeRes = await fetch("/api/auth/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ walletAddress, authType: walletType }),
    });
    const { nonce, error: challengeErr } = await challengeRes.json();
    if (!challengeRes.ok) throw new Error(challengeErr || "Failed to get challenge");

    // 2. Sign nonce
    let signPayload: object = {};
    if (walletType === "freighter") {
      try {
        const signRes = await signMessage(nonce);
        const sig = typeof signRes === "string" ? signRes : (signRes as any).signature ?? "";
        signPayload = { signature: sig };
      } catch (e: any) {
        throw new Error("Freighter signing failed: " + (e?.message || e));
      }
    } else if (walletType === "albedo") {
      const signRes = await albedo.signMessage({ message: nonce, pubkey: walletAddress });
      signPayload = { signature: signRes.message_signature };
    } else {
      // Passkey — sign via WebAuthn assertion
      const credentialId = getStoredCredentialId() ?? undefined;
      const assertion = await authenticatePasskey(nonce, credentialId);
      signPayload = {
        credentialId: assertion.credentialId,
        clientDataJSON: assertion.clientDataJSON,
        authenticatorData: assertion.authenticatorData,
        signatureB64: assertion.signature,
      };
    }

    // 3. Verify and issue session
    const verifyRes = await fetch("/api/auth/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        walletAddress,
        authType: walletType,
        ...signPayload,
        ...extraBody,
      }),
    });
    const verifyData = await verifyRes.json();
    if (!verifyRes.ok) throw new Error(verifyData.error || "Verification failed");

    return verifyData;
  };

  // ── Freighter Handler ───────────────────────────────────────────────────────
  const handleFreighter = async () => {
    setIsLoading(true);
    setActiveWallet("freighter");
    setMessage(null);
    try {
      const connected = await isConnected();
      if (!connected) {
        setMessage({ type: "error", text: "Freighter is not installed or locked. Install it from freighter.app" });
        return;
      }
      await setAllowed();
      const res = await getAddress();
      if (res.error) throw new Error(res.error);

      await runAuthFlow(res.address, "freighter");
      router.push("/dashboard");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Freighter login failed." });
    } finally {
      setIsLoading(false);
      setActiveWallet(null);
    }
  };

  // ── Albedo Handler ──────────────────────────────────────────────────────────
  const handleAlbedo = async () => {
    setIsLoading(true);
    setActiveWallet("albedo");
    setMessage(null);
    try {
      const res = await albedo.publicKey({});
      await runAuthFlow(res.pubkey, "albedo");
      router.push("/dashboard");
    } catch (err: any) {
      setMessage({ type: "error", text: err.message || "Albedo login failed." });
    } finally {
      setIsLoading(false);
      setActiveWallet(null);
    }
  };

  // ── Passkey Handler ─────────────────────────────────────────────────────────
  const handlePasskey = async () => {
    setIsLoading(true);
    setActiveWallet("passkey");
    setMessage(null);
    try {
      const existingCredentialId = getStoredCredentialId();

      if (existingCredentialId) {
        // ── Returning user — authenticate ──────────────────────────────────
        // We need a wallet handle first to get a challenge.
        // The handle is stored with the credential.
        // We use the credential ID prefix as the wallet handle (same as registration).
        const walletHandle = `pk_${existingCredentialId.slice(0, 24)}`;
        await runAuthFlow(walletHandle, "passkey");
        router.push("/dashboard");
      } else {
        // ── New user — register passkey ────────────────────────────────────
        setMessage({ type: "info", text: "Creating your passkey — follow the biometric prompt..." });

        const displayName = `user_${Date.now().toString(36)}`;
        const reg = await registerPasskey(displayName);

        // Store the passkey profile in DB so verify can look it up
        const regRes = await fetch("/api/auth/passkey/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletHandle: reg.walletHandle,
            credentialId: reg.credentialId,
            publicKeyBase64: reg.publicKeyBase64,
          }),
        });
        if (!regRes.ok) throw new Error("Failed to register passkey");

        // Now authenticate immediately after registration
        await runAuthFlow(reg.walletHandle, "passkey");
        router.push("/dashboard");
      }
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        setMessage({ type: "error", text: "Biometric authentication was cancelled. Please try again." });
      } else {
        setMessage({ type: "error", text: err.message || "Passkey login failed." });
      }
    } finally {
      setIsLoading(false);
      setActiveWallet(null);
    }
  };

  const busy = isLoading;

  return (
    <main className="auth-page-shell">
      <div className="auth-page-card glass-panel">
        {/* Header */}
        <div className="auth-header" style={{ textAlign: "center", marginBottom: "2rem" }}>
          <div
            className="role-badge"
            style={{
              background: "linear-gradient(135deg, var(--accent-alpha), rgba(139,92,246,0.15))",
              color: "var(--accent)",
              margin: "0 auto 1rem auto",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <Wallet size={16} /> Wallet Login
          </div>
          <h1 className="heading-xl" style={{ marginBottom: "0.5rem" }}>Connect to Kredex</h1>
          <p className="text-secondary">Sign in with your Stellar wallet or device biometrics.</p>
          <p className="text-secondary" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>
            No password. No email. You own your account.
          </p>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`auth-alert auth-alert--${message.type}`}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.75rem",
              marginBottom: "1.5rem",
              padding: "0.9rem 1.1rem",
              borderRadius: "10px",
              background: message.type === "error"
                ? "rgba(239,68,68,0.12)"
                : message.type === "success"
                  ? "rgba(34,207,157,0.12)"
                  : "rgba(96,165,250,0.12)",
              border: `1px solid ${message.type === "error" ? "rgba(239,68,68,0.3)" : message.type === "success" ? "rgba(34,207,157,0.3)" : "rgba(96,165,250,0.3)"}`,
            }}
          >
            {message.type === "error"
              ? <AlertTriangle size={18} style={{ color: "#ef4444", flexShrink: 0, marginTop: 2 }} />
              : <ShieldCheck size={18} style={{ color: "#22cf9d", flexShrink: 0, marginTop: 2 }} />
            }
            <span style={{ fontSize: "0.9rem", lineHeight: 1.5 }}>{message.text}</span>
          </div>
        )}

        {/* Wallet Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>

          {/* Passkey — shown first if supported */}
          {passkeyAvailable && (
            <button
              onClick={handlePasskey}
              disabled={busy}
              className="btn btn-primary"
              style={{
                padding: "1.2rem 1.5rem",
                justifyContent: "space-between",
                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                border: "none",
                position: "relative",
                overflow: "hidden",
                whiteSpace: "normal",
                textAlign: "left",
                gap: "1rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flex: 1, minWidth: 0 }}>
                {isLoading && activeWallet === "passkey" ? (
                  <Loader2 size={22} className="animate-spin" style={{ flexShrink: 0 }} />
                ) : (
                  <Fingerprint size={22} style={{ flexShrink: 0 }} />
                )}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>
                    {hasExistingPasskey ? "Continue with Passkey" : "Create Passkey"}
                  </div>
                  <div style={{ fontSize: "0.75rem", opacity: 0.8, marginTop: "1px", lineHeight: 1.3 }}>
                    Face ID · Touch ID · Fingerprint
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                <span className="recommended-badge" style={{
                  background: "rgba(255,255,255,0.2)",
                  fontSize: "0.6rem",
                  fontWeight: 800,
                  padding: "2px 7px",
                  borderRadius: "999px",
                  letterSpacing: "0.08em"
                }}>
                  RECOMMENDED
                </span>
                <ChevronRight size={18} />
              </div>
            </button>
          )}

          {/* Divider */}
          <div style={{
            display: "flex", alignItems: "center", gap: "0.75rem",
            color: "var(--text-secondary)", fontSize: "0.8rem"
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            {passkeyAvailable ? "Or use a Stellar wallet" : "Select a wallet"}
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>

          <button
            onClick={handleFreighter}
            disabled={busy}
            className="btn btn-outline"
            style={{ 
              padding: "1rem 1.5rem", 
              justifyContent: "space-between",
              whiteSpace: "normal",
              textAlign: "left",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flex: 1, minWidth: 0 }}>
              {isLoading && activeWallet === "freighter" ? (
                <Loader2 size={20} className="animate-spin" style={{ flexShrink: 0 }} />
              ) : (
                <Monitor size={20} style={{ flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>Freighter Wallet</div>
                <div style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "1px", lineHeight: 1.3 }}>
                  Browser extension — best for desktop
                </div>
              </div>
            </div>
            <ChevronRight size={16} style={{ opacity: 0.5, flexShrink: 0 }} />
          </button>

          <button
            onClick={handleAlbedo}
            disabled={busy}
            className="btn btn-outline"
            style={{ 
              padding: "1rem 1.5rem", 
              justifyContent: "space-between",
              whiteSpace: "normal",
              textAlign: "left",
              gap: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.85rem", flex: 1, minWidth: 0 }}>
              {isLoading && activeWallet === "albedo" ? (
                <Loader2 size={20} className="animate-spin" style={{ flexShrink: 0 }} />
              ) : (
                <Smartphone size={20} style={{ flexShrink: 0 }} />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600 }}>Albedo</div>
                <div style={{ fontSize: "0.75rem", opacity: 0.7, marginTop: "1px", lineHeight: 1.3 }}>
                  Web-based · works on mobile
                </div>
              </div>
            </div>
            <ChevronRight size={16} style={{ opacity: 0.5, flexShrink: 0 }} />
          </button>
        </div>

        {/* Footer */}
        <p
          className="text-secondary"
          style={{ textAlign: "center", marginTop: "1.75rem", fontSize: "0.78rem", lineHeight: 1.6 }}
        >
          By connecting, you agree to our Terms of Service. Your wallet is your identity — we never store private keys.
        </p>
      </div>
    </main>
  );
}

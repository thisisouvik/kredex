"use client";

import { useState, useEffect } from "react";
import {
  Loader2, Smartphone, Monitor,
  Wallet, ChevronRight} from "lucide-react";
import albedo from "@albedo-link/intent";
import {
  isConnected,
  setAllowed,
  getAddress,
  signMessage,
} from "@stellar/freighter-api";
type WalletOption = "freighter" | "albedo";

import { useAlert } from "@/components/ui/AlertProvider";

export function AuthPageClient() {

  const [isLoading, setIsLoading] = useState(false);
  const [activeWallet, setActiveWallet] = useState<WalletOption | null>(null);
  const { showAlert } = useAlert();

  useEffect(() => {
    // Component mounted
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
        // @ts-expect-error Freighter returns varying signature payload formats depending on version
        const sig = signRes.signedMessage || signRes.signature || (typeof signRes === "string" ? signRes : "");
        if (!sig) throw new Error("Wallet returned empty signature");
        signPayload = { signature: sig };
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error("Freighter signing failed: " + msg);
      }
    } else if (walletType === "albedo") {
      const signRes = await albedo.signMessage({ message: nonce, pubkey: walletAddress });
      signPayload = { signature: signRes.message_signature };
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

    // ── Set session cookie ────────────────────────────────────────────────────
    // Method 1: verify route already set it via Set-Cookie response header.
    // Method A: document.cookie as immediate client-side backup.
    // Method C: redirect through /api/auth/set-session (server sets httpOnly cookie).
    //
    // NOTE: Server Action (Method B) was REMOVED — it caused the proxy to
    // intercept the POST /auth server action call and redirect it to /dashboard,
    // breaking the entire auth flow.
    if (verifyData.token) {
      // Method A: client-side cookie (immediate)
      try {
        const isProd = window.location.protocol === "https:";
        const maxAge = 7 * 24 * 60 * 60;
        document.cookie = `Kredex_session=${verifyData.token}; Path=/; Max-Age=${maxAge}; SameSite=Lax${isProd ? "; Secure" : ""}`;
      } catch (_) { /* ignore */ }

      // Method C: redirect through server route (guarantees httpOnly cookie)
      return {
        ...verifyData,
        redirectUrl: `/api/auth/set-session?t=${encodeURIComponent(verifyData.token)}`,
      };
    }

    return verifyData;
  };

  // ── Freighter Handler ───────────────────────────────────────────────────────
  const handleFreighter = async () => {
    setIsLoading(true);
    setActiveWallet("freighter");
    try {
      const connected = await isConnected();
      if (!connected) {
        showAlert("Wallet Not Found", "Freighter is not installed or locked. Install it from freighter.app to continue.", "error", 6000);
        return;
      }
      await setAllowed();
      const res = await getAddress();
      if (res.error) throw new Error(res.error);

      const data = await runAuthFlow(res.address, "freighter");
      showAlert("Welcome back!", "Successfully signed in with Freighter.", "success", 3000);

      // Cookie is already set by Methods A+B; Method C redirects through set-session.
      const dest = (data as { redirectUrl?: string })?.redirectUrl ?? "/dashboard";
      setTimeout(() => { window.location.href = dest; }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Freighter login failed.";
      showAlert("Authentication Failed", msg, "error");
    } finally {
      setIsLoading(false);
      setActiveWallet(null);
    }
  };

  // ── Albedo Handler ──────────────────────────────────────────────────────────
  const handleAlbedo = async () => {
    setIsLoading(true);
    setActiveWallet("albedo");
    try {
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Request is taking a long time. Please retry after some time.")), 15000)
      );

      const res = await Promise.race([albedo.publicKey({}), timeoutPromise]);
      const data = await runAuthFlow(res.pubkey, "albedo");

      showAlert("Welcome back!", "Successfully signed in with Albedo.", "success", 3000);
      // Cookie is already set by Methods A+B; Method C redirects through set-session.
      const dest = (data as { redirectUrl?: string })?.redirectUrl ?? "/dashboard";
      setTimeout(() => { window.location.href = dest; }, 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Albedo login failed.";
      showAlert("Authentication Failed", msg, "error");
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



        {/* Wallet Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>

          {/* Divider */}
          <div style={{
            display: "flex", alignItems: "center", gap: "0.75rem",
            color: "var(--text-secondary)", fontSize: "0.8rem"
          }}>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            Select a wallet
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

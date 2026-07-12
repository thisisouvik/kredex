"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAlert } from "@/components/ui/AlertProvider";
import { type UserRole } from "@/lib/auth/roles";

interface RoleMetric {
  label: string;
  value: string;
}

interface RoleDashboardScreenProps {
  expectedRole: UserRole;
  heading: string;
  description: string;
  metrics: RoleMetric[];
  primaryHref: string;
  primaryLabel: string;
  secondaryHref: string;
  secondaryLabel: string;
}

export function RoleDashboardScreen({
  expectedRole,
  heading,
  description,
  metrics,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: RoleDashboardScreenProps) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [walletDisplay, setWalletDisplay] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { showAlert } = useAlert();

  useEffect(() => {
    let cancelled = false;

    const ensureRoleAccess = async () => {
      // Use our JWT-based /api/auth/me instead of supabase.auth.getSession().
      // Wallet login does NOT create a Supabase Auth session — getSession()
      // always returned null and was causing incorrect redirects to signout.
      try {
        const res = await fetch("/api/auth/me");

        if (!res.ok) {
          if (!cancelled) router.replace("/auth");
          return;
        }

        const data = await res.json() as {
          authenticated: boolean;
          user?: { id: string; wallet: string; role: string };
        };

        if (!data.authenticated || !data.user) {
          if (!cancelled) router.replace("/auth");
          return;
        }

        // If the user's actual role differs from this dashboard's expected role,
        // redirect them to their correct dashboard instead of showing an error.
        if (data.user.role && data.user.role !== expectedRole) {
          if (!cancelled) router.replace(`/dashboard/${data.user.role}`);
          return;
        }

        if (!cancelled) {
          // Show abbreviated wallet address as identity indicator
          const w = data.user.wallet;
          setWalletDisplay(w ? `${w.slice(0, 6)}…${w.slice(-4)}` : null);
          setReady(true);
        }
      } catch {
        // Network error — server already validated auth server-side, so allow render
        if (!cancelled) setReady(true);
      }
    };

    void ensureRoleAccess();
    return () => { cancelled = true; };
  }, [expectedRole, router]);

  const handleSignOut = async () => {
    showAlert("Farewell!", "Successfully signed out. See you next time.", "success", 3000);
    setTimeout(() => {
      window.location.href = "/api/auth/signout";
    }, 1500);
  };

  if (error) {
    return (
      <main className="role-dashboard-shell">
        <p className="role-error">{error}</p>
      </main>
    );
  }

  if (!ready) {
    return (
      <main className="role-dashboard-shell">
        <p className="role-loading">Loading your {expectedRole} workspace...</p>
      </main>
    );
  }

  return (
    <main className="role-dashboard-shell">
      <section className="role-dashboard-card">
        <div className="role-head">
          <div>
            <p className="role-kicker">{expectedRole} dashboard</p>
            <h1 className="font-display role-title">{heading}</h1>
            <p className="role-description">{description}</p>
          </div>
          <button type="button" className="role-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>

        <p className="role-email">Signed in as: {walletDisplay ?? "Wallet User"}</p>

        <div className="role-metrics">
          {metrics.map((item) => (
            <article key={item.label} className="role-metric-card">
              <p className="role-metric-value font-display">{item.value}</p>
              <p className="role-metric-label">{item.label}</p>
            </article>
          ))}
        </div>

        <div className="role-actions">
          <Link href={primaryHref} className="role-action-primary">
            {primaryLabel}
          </Link>
          <Link href={secondaryHref} className="role-action-secondary">
            {secondaryLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { X, ArrowRight, Lightbulb } from "lucide-react";

export function WalkthroughOverlay() {
  const pathname = usePathname();
  const [dismissed, setDismissed] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const isDismissed = localStorage.getItem("kredex_walkthrough_dismissed") === "true";
    setDismissed(isDismissed);
  }, []);

  if (!mounted || dismissed) return null;
  
  if (!pathname.startsWith("/dashboard")) return null;

  const dismissWalkthrough = () => {
    localStorage.setItem("kredex_walkthrough_dismissed", "true");
    setDismissed(true);
  };

  let title = "";
  let message = "";
  let actionText = "";
  let nextHref = "";

  if (pathname === "/dashboard") {
    title = "Welcome to Kredex!";
    message = "Choose whether you want to borrow funds or supply liquidity as a lender. Click one of the cards on this page to begin.";
  } else if (pathname === "/dashboard/borrower") {
    title = "Borrower Dashboard";
    message = "Welcome to your Borrower Dashboard! As a Silver Tier user, you can request a test loan up to 100 XLM right away.";
    actionText = "Next: Apply for a loan";
    nextHref = "/dashboard/borrower/loans";
  } else if (pathname === "/dashboard/borrower/loans") {
    title = "Apply for a Loan";
    message = "Fill out the amount (up to 100 XLM) and duration, then click 'Submit Application'. Your wallet will ask you to approve the transaction, giving you your first transaction hash!";
  } else if (pathname === "/dashboard/lender") {
    title = "Lender Dashboard";
    message = "Welcome to your Lender Dashboard! Click on 'Manage Pools' or 'Direct P2P Loans' to fund a loan.";
    actionText = "Next: Explore pools";
    nextHref = "/dashboard/lender/pools";
  } else if (pathname.includes("/dashboard/lender/pools") || pathname.includes("/dashboard/lender/history")) {
    title = "Fund a Loan";
    message = "Select a pool or loan and deposit funds to start earning. Your wallet will prompt you to approve the transaction, giving you your first transaction hash!";
  } else {
    title = "Explore Kredex";
    message = "Explore your profile, history, and settings from the sidebar. Ready to make a transaction?";
    if (pathname.startsWith("/dashboard/borrower")) {
      actionText = "Next: Apply for a loan";
      nextHref = "/dashboard/borrower/loans";
    } else if (pathname.startsWith("/dashboard/lender")) {
      actionText = "Next: Explore pools";
      nextHref = "/dashboard/lender/pools";
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        bottom: "1.5rem",
        right: "1.5rem",
        width: "calc(100% - 3rem)",
        maxWidth: "340px",
        background: "var(--bg-card)",
        border: "1px solid var(--border-strong)",
        borderRadius: "1rem",
        boxShadow: "0 12px 30px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(126, 47, 208, 0.1) inset",
        padding: "1.25rem",
        zIndex: 9999,
        animation: "slideInRight 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--indigo-main)" }}>
          <Lightbulb size={20} />
          <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>{title}</h4>
        </div>
        <button
          onClick={dismissWalkthrough}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            cursor: "pointer",
            padding: "0.2rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "0.25rem"
          }}
          aria-label="Skip Walkthrough"
        >
          <X size={18} />
        </button>
      </div>
      
      <p style={{ margin: "0 0 1rem", fontSize: "0.875rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
        {message}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {actionText && nextHref ? (
          <Link href={nextHref} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 700, color: "white", background: "var(--indigo-main)", padding: "0.6rem", borderRadius: "9999px", textDecoration: "none", width: "100%" }}>
            {actionText} <ArrowRight size={16} />
          </Link>
        ) : actionText ? (
          <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.4rem", fontSize: "0.85rem", fontWeight: 700, color: "var(--indigo-main)", padding: "0.6rem", width: "100%" }}>
            {actionText} <ArrowRight size={16} />
          </span>
        ) : null}

        <button
          onClick={dismissWalkthrough}
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text-muted)",
            fontSize: "0.8rem",
            fontWeight: 600,
            cursor: "pointer",
            padding: "0.4rem",
            width: "100%"
          }}
        >
          Skip Walkthrough
        </button>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes slideInRight {
          from { transform: translateX(100%) opacity(0); }
          to { transform: translateX(0) opacity(1); }
        }
      `}} />
    </div>
  );
}

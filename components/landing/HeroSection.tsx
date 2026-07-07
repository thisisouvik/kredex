import type { HeroContent } from "@/types/landing";

interface HeroSectionProps {
  content: HeroContent;
  isAuthenticated?: boolean;
}

export function HeroSection({ content, isAuthenticated = false }: HeroSectionProps) {
  return (
    <section id="home" className="hero-section section-anchor">
      {/* Ambient background */}
      <div className="hero-bg-grid" aria-hidden="true" />
      <div className="hero-glow-1" aria-hidden="true" />
      <div className="hero-glow-2" aria-hidden="true" />

      <div className="crypto-container hero-grid">
        {/* Copy */}
        <article className="hero-copy animate-fade-up">
          <div className="hero-eyebrow-badge">
            <span className="hero-eyebrow-dot" />
            {content.eyebrow}
          </div>

          <h1 className="hero-title font-display">
            <span className="hero-title-line">{content.titleMain}</span>
            <span className="hero-title-line hero-title-accent">{content.titleAccent}</span>
          </h1>

          <p className="hero-description">{content.description}</p>

          <div className="hero-trust-pills" role="list" aria-label="Kredex highlights">
            <span className="hero-trust-pill" role="listitem">Passkey login</span>
            <span className="hero-trust-pill" role="listitem">Circle USDC</span>
            <span className="hero-trust-pill" role="listitem">On-chain reputation</span>
            <span className="hero-trust-pill" role="listitem">P2P escrow</span>
          </div>

          <div className="hero-cta-wrap">
            <a
              href={isAuthenticated ? "/dashboard" : "/auth"}
              className="google-btn google-btn-hero"
              id="hero-start-btn"
            >
              {isAuthenticated ? "Go to Dashboard →" : "Get started free →"}
            </a>
            <a href="#p2p" style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>
              See how it works
            </a>
          </div>

          <p className="hero-subnote">
            No seed phrase. No password. Connect with Face ID, Freighter, or Albedo.
          </p>
        </article>

        {/* Visual panel */}
        <article className="hero-visual" aria-hidden="true">
          <div className="hero-visual-card">
            {/* Simulated dashboard preview */}
            <div style={{ marginBottom: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                <span style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--text-muted)" }}>Reputation Score</span>
                <span style={{ fontSize: "0.72rem", color: "var(--indigo-light)", fontWeight: 600, background: "var(--indigo-alpha)", padding: "0.2rem 0.6rem", borderRadius: 999 }}>Silver Tier</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: "0.75rem" }}>
                <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "3rem", fontWeight: 800, color: "var(--text-primary)", lineHeight: 1, letterSpacing: "-0.04em" }}>742</span>
                <span style={{ fontSize: "0.82rem", color: "var(--green)", fontWeight: 600, marginBottom: "0.5rem" }}>▲ +18 this month</span>
              </div>
              <div style={{ marginTop: "0.75rem", height: 6, background: "var(--bg-elevated)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: "74%", height: "100%", background: "linear-gradient(90deg, #6366F1, #14B8A6)", borderRadius: 999 }} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              {[
                { label: "Active Loan", value: "$250 USDC", color: "var(--indigo-light)" },
                { label: "Due In", value: "14 days", color: "var(--amber)" },
                { label: "Total Repaid", value: "$890 USDC", color: "var(--teal-light)" },
                { label: "Next Limit", value: "$500 USDC", color: "var(--text-secondary)" },
              ].map((s) => (
                <div key={s.label} style={{ background: "var(--bg-elevated)", borderRadius: 10, padding: "0.85rem", border: "1px solid var(--border)" }}>
                  <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.25rem" }}>{s.label}</p>
                  <p style={{ fontFamily: "'Space Grotesk', sans-serif", fontSize: "1rem", fontWeight: 700, color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="hero-stat hero-stat-tl">
            <span className="hero-stat-val">🔐</span>
            <span className="hero-stat-label">Passkey secured</span>
          </div>
          <div className="hero-stat hero-stat-br">
            <span className="hero-stat-val">3.4k</span>
            <span className="hero-stat-label">Active users</span>
          </div>
        </article>
      </div>
    </section>
  );
}

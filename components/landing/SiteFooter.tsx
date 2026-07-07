import type { FooterLink } from "@/types/landing";

interface SiteFooterProps {
  links: FooterLink[];
}

export function SiteFooter({ links }: SiteFooterProps) {
  return (
    <footer className="site-footer">
      <div className="crypto-container">
        <div className="site-footer-grid">
          {/* Brand */}
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "linear-gradient(135deg, #6366F1, #14B8A6)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "'Space Grotesk', sans-serif", fontWeight: 800,
                  color: "#fff", fontSize: "1rem",
                }}
              >
                K
              </div>
              <h2 className="font-display site-footer-brand" style={{ margin: 0 }}>Kredex</h2>
            </div>
            <p className="site-footer-tagline">
              Credit infrastructure built on real behavior, not collateral bias.
            </p>
            <p className="site-footer-subtext">
              Borrowers and lenders collaborate in one transparent network where every repayment strengthens the next opportunity — powered by Stellar and Circle USDC.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="site-footer-heading">Explore</h3>
            <ul className="site-footer-list">
              {links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className="site-footer-link">{link.label}</a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="site-footer-heading">Contact</h3>
            <ul className="site-footer-list">
              <li>support@kredex.io</li>
              <li>Global, community-first network</li>
              <li>Version v1.0.0 — Testnet</li>
            </ul>
          </div>
        </div>

        <div className="site-footer-bottom">
          <p>© 2026 Kredex. All rights reserved.</p>
          <p>Built on Stellar · Powered by Circle USDC · Secured by Soroban</p>
        </div>
      </div>
    </footer>
  );
}

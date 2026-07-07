import Image from "next/image";
import type { NavItem } from "@/types/landing";

interface SiteHeaderProps {
  items: NavItem[];
  isAuthenticated?: boolean;
}

export function SiteHeader({ items, isAuthenticated = false }: SiteHeaderProps) {
  return (
    <header className="site-header">
      <div className="crypto-container site-header-row">
        {/* Logo */}
        <a href="#home" className="site-logo-wrap" aria-label="Kredex home">
          <div className="site-logo-orb" aria-hidden="true">
            <Image src="/logo.png" alt="Kredex" width={24} height={24} style={{ objectFit: 'contain' }} />
          </div>
          <span>
            <strong className="font-display site-logo-title">Kredex</strong>
            <small className="site-logo-subtitle">On-chain credit network</small>
          </span>
        </a>

        {/* Desktop Nav */}
        <nav className="site-nav-desktop" aria-label="Primary">
          {items.map((item) => (
            <a key={item.href} href={item.href} className="site-nav-link">
              {item.label}
            </a>
          ))}
        </nav>

        {/* Actions */}
        <div className="site-header-actions">
          <a href="#faq" className="site-nav-utility">Need help?</a>
          {isAuthenticated ? (
            <a href="/dashboard" className="google-btn google-btn-header" id="header-dashboard-btn">
              Dashboard
            </a>
          ) : (
            <a href="/auth" className="google-btn google-btn-header" id="header-signin-btn">
              Sign in
            </a>
          )}
        </div>
      </div>

      {/* Mobile Nav */}
      <div className="site-nav-mobile-wrap">
        <nav className="crypto-container site-nav-mobile" aria-label="Primary mobile">
          {items.map((item) => (
            <a key={item.href} href={item.href} className="site-nav-link">
              {item.label}
            </a>
          ))}
        </nav>
      </div>
    </header>
  );
}

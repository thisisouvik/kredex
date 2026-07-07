import { CheckCircle2, Shield, Zap, Globe, Lock, TrendingUp } from "lucide-react";
import type { ReasonItem } from "@/types/landing";

interface UspSectionProps {
  items: ReasonItem[];
}

const ICONS = [Shield, Zap, Globe, Lock, TrendingUp, CheckCircle2];

export function UspSection({ items }: UspSectionProps) {
  return (
    <section id="introduce" className="usp-section section-anchor">
      <div className="crypto-container">
        <div className="usp-section-label">
          <span style={{ width: 20, height: 1, background: "var(--indigo-light)", display: "inline-block" }} />
          Why Kredex
        </div>

        <div style={{ maxWidth: "52ch" }}>
          <h2 className="heading-xl font-display" style={{ marginBottom: "1rem" }}>
            Credit that works{" "}
            <span style={{ background: "linear-gradient(135deg, #818CF8, #2DD4BF)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              for everyone
            </span>
          </h2>
          <p className="text-secondary" style={{ fontSize: "1.05rem", lineHeight: 1.7 }}>
            Kredex is the first lending platform where your on-chain behaviour is your credit score. No paperwork. No collateral. Just trust earned on-chain.
          </p>
        </div>

        <div className="usp-grid">
          {items.map((item, i) => {
            const Icon = ICONS[i % ICONS.length];
            return (
              <div key={item.title} className="usp-card">
                <div className="usp-icon">
                  <Icon size={22} color="var(--indigo-light)" />
                </div>
                <h3 className="usp-title">{item.title}</h3>
                <p className="usp-description">
                  {item.description ?? "Powered by Stellar and Circle USDC for seamless, low-cost global transactions."}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

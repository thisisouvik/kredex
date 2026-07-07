import { SiteFooter, SiteHeader, AboutSection } from "@/components/landing";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { footerLinks, navItems, aboutContent, p2pSteps } from "@/lib/content/landing-content";

export const metadata = {
  title: "P2P Lending | Kredex",
  description: "Transparent peer-to-peer lending powered by Stellar and USDC.",
};

export default async function P2PPage() {
  const session = await getAuthenticatedUser();
  const isAuthenticated = Boolean(session?.user);

  return (
    <div className="site-shell">
      <SiteHeader items={navItems} isAuthenticated={isAuthenticated} />
      
      <main style={{ padding: "6rem 0 3rem" }}>
        <div className="crypto-container" style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h1 className="heading-xl" style={{ marginBottom: "1rem" }}>
            Peer-to-Peer Lending
          </h1>
          <p className="text-secondary" style={{ fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>
            Kredex connects lenders and borrowers directly using smart contracts, eliminating middlemen and ensuring trustless, atomic execution.
          </p>
        </div>
        <AboutSection content={aboutContent} steps={p2pSteps} />
      </main>

      <SiteFooter links={footerLinks} />
    </div>
  );
}

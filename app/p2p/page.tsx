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
      
      <main className="pt-24 pb-12">
        <div className="crypto-container text-center mb-12">
          <h1 className="font-display text-4xl md:text-5xl text-[#1d254a] mb-4">
            Peer-to-Peer Lending
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Kredex connects lenders and borrowers directly using smart contracts, eliminating middlemen and ensuring trustless, atomic execution.
          </p>
        </div>
        <AboutSection content={aboutContent} steps={p2pSteps} />
      </main>

      <SiteFooter links={footerLinks} />
    </div>
  );
}

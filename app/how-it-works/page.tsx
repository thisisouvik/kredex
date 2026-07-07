import { SiteFooter, SiteHeader, ProcessSection } from "@/components/landing";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { footerLinks, navItems, processSteps } from "@/lib/content/landing-content";

export const metadata = {
  title: "How it Works | Kredex",
  description: "Learn how to build reputation and access micro-loans on Kredex.",
};

export default async function HowItWorksPage() {
  const session = await getAuthenticatedUser();
  const isAuthenticated = Boolean(session?.user);

  return (
    <div className="site-shell">
      <SiteHeader items={navItems} isAuthenticated={isAuthenticated} />
      
      <main style={{ padding: "6rem 0 3rem" }}>
        <div className="crypto-container" style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h1 className="heading-xl" style={{ marginBottom: "1rem" }}>
            How Kredex Works
          </h1>
          <p className="text-secondary" style={{ fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>
            A transparent journey from connecting your wallet to building an on-chain reputation that unlocks fairly priced micro-loans.
          </p>
        </div>
        <ProcessSection steps={processSteps} />
      </main>

      <SiteFooter links={footerLinks} />
    </div>
  );
}

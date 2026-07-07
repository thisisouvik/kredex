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
      
      <main className="pt-24 pb-12">
        <div className="crypto-container text-center mb-12">
          <h1 className="font-display text-4xl md:text-5xl text-[#1d254a] mb-4">
            How Kredex Works
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            A transparent journey from connecting your wallet to building an on-chain reputation that unlocks fairly priced micro-loans.
          </p>
        </div>
        <ProcessSection steps={processSteps} />
      </main>

      <SiteFooter links={footerLinks} />
    </div>
  );
}

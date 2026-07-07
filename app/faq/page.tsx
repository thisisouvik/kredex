import { SiteFooter, SiteHeader, FaqSection } from "@/components/landing";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { footerLinks, navItems, faqItems } from "@/lib/content/landing-content";

export const metadata = {
  title: "Frequently Asked Questions | Kredex",
  description: "Find answers to common questions about using Kredex.",
};

export default async function FaqPage() {
  const session = await getAuthenticatedUser();
  const isAuthenticated = Boolean(session?.user);

  return (
    <div className="site-shell">
      <SiteHeader items={navItems} isAuthenticated={isAuthenticated} />
      
      <main className="pt-24 pb-12">
        <div className="crypto-container text-center mb-8">
          <h1 className="font-display text-4xl md:text-5xl text-[#1d254a] mb-4">
            Frequently Asked Questions
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Everything you need to know about building reputation and participating in our decentralized lending ecosystem.
          </p>
        </div>
        <FaqSection items={faqItems} />
      </main>

      <SiteFooter links={footerLinks} />
    </div>
  );
}

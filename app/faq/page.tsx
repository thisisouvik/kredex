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
      
      <main style={{ padding: "6rem 0 3rem" }}>
        <div className="crypto-container" style={{ textAlign: "center", marginBottom: "3rem" }}>
          <h1 className="heading-xl" style={{ marginBottom: "1rem" }}>
            Frequently Asked Questions
          </h1>
          <p className="text-secondary" style={{ fontSize: "1.1rem", maxWidth: "600px", margin: "0 auto" }}>
            Everything you need to know about building reputation and participating in our decentralized lending ecosystem.
          </p>
        </div>
        <FaqSection items={faqItems} />
      </main>

      <SiteFooter links={footerLinks} />
    </div>
  );
}

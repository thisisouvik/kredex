import {
  HeroSection,
  SiteFooter,
  SiteHeader,
  TestimonialsSection,
  UspSection,
  FaqSection,
} from "@/components/landing";
import { getAuthenticatedUser } from "@/lib/auth/session";
import {
  footerLinks,
  heroContent,
  navItems,
  reasons,
  testimonials,
  faqItems,
} from "@/lib/content/landing-content";

export default async function Home() {
  const session = await getAuthenticatedUser();
  const isAuthenticated = Boolean(session?.user);

  return (
    <div className="site-shell">
      <SiteHeader items={navItems} isAuthenticated={isAuthenticated} />

      <main>
        <HeroSection content={heroContent} isAuthenticated={isAuthenticated} />
        <UspSection items={reasons} />
        <TestimonialsSection items={testimonials} />
        <FaqSection items={faqItems} />
      </main>

      <SiteFooter links={footerLinks} />
    </div>
  );
}

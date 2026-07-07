import type {
  AboutContent,
  FaqItem,
  FooterLink,
  HighlightContent,
  HeroContent,
  MetricItem,
  NavItem,
  P2PStep,
  ReasonItem,
  StepItem,
  Testimonial,
} from "@/types/landing";

export const navItems: NavItem[] = [
  { label: "Home",      href: "/" },
  { label: "How it works", href: "/how-it-works" },
  { label: "P2P",      href: "/p2p" },
  { label: "FAQ",       href: "/faq" },
];

export const heroContent: HeroContent = {
  eyebrow: "On-chain credit — for the real world",
  titleMain: "Borrow smarter.",
  titleAccent: "Lend with confidence.",
  description:
    "Kredex connects borrowers and lenders through behaviour-based on-chain reputation and transparent P2P workflows — powered by Stellar and Circle USDC.",
};

export const metrics: MetricItem[] = [
  { value: "$110B+",  label: "Potential lending volume" },
  { value: "15M+",   label: "Emerging market freelancers" },
  { value: "98.5%",  label: "Target repayment success" },
  { value: "<2 Min", label: "Passkey or wallet onboarding" },
];

export const highlightContent: HighlightContent = {
  title: "Anytime, Anywhere",
  description:
    "Kredex helps users build reputation from real behaviour and unlock fair capital without paperwork-heavy approval cycles.",
  callout:
    "No paid tasks. No synthetic score farming. Just real financial trust that compounds with every healthy action.",
};

export const processSteps: StepItem[] = [
  {
    step: "01",
    title: "Connect your wallet",
    description:
      "Sign in with Face ID via Passkey, or use Freighter / Albedo. No password or email required.",
  },
  {
    step: "02",
    title: "Build your trust profile",
    description:
      "Your profile starts with a baseline reputation score and tracks every on-chain action automatically.",
  },
  {
    step: "03",
    title: "Grow reputation through behaviour",
    description:
      "Score grows through repayment consistency, lending participation, and on-chain transaction discipline.",
  },
  {
    step: "04",
    title: "Access fair micro-loans in USDC",
    description:
      "Borrowers unlock faster approvals while lenders allocate to transparent, risk-adjusted P2P loans.",
  },
  {
    step: "05",
    title: "Scale with compounding trust",
    description:
      "Each healthy cycle expands credit access, confidence, and long-term economic mobility.",
  },
];

export const reasons: ReasonItem[] = [
  { title: "Passkey & biometric login — no seed phrase", description: "Sign in with Face ID or fingerprint. No 24-word recovery phrase. Powered by WebAuthn." },
  { title: "24/7 transparent on-chain score updates", description: "Your reputation score lives on Stellar Soroban. It updates with every loan repaid or funded." },
  { title: "No collateral required — behaviour is your credit", description: "Kredex evaluates your on-chain history, not your collateral. Fair for everyone." },
  { title: "Circle USDC — no crypto price volatility", description: "All loans are denominated in USDC. Borrow and repay in stable dollar-pegged currency." },
  { title: "Atomic P2P escrow — trustless by design", description: "Funds move directly between wallets via Soroban smart contracts. No middleman." },
  { title: "KYC tiers unlock higher limits", description: "Start at $50 USDC with zero KYC. Verify your identity to unlock $500 and $5,000 limits." },
];

export const aboutContent: AboutContent = {
  title: "P2P lending in 3 transparent steps",
  description:
    "A clear flow gives both sides confidence: borrowers request with trust context, lenders commit with transparent signals, and funds settle atomically on-chain.",
};

export const p2pSteps: P2PStep[] = [
  {
    step: "1",
    title: "Place request with trust profile",
    description:
      "Borrowers submit amount and purpose. Lenders instantly view behaviour-based reputation data, KYC tier, and repayment history.",
  },
  {
    step: "2",
    title: "Confirm terms and escrow",
    description:
      "Both sides lock terms clearly. USDC is atomically transferred to the escrow smart contract — no trust required.",
  },
  {
    step: "3",
    title: "Unlock capital and track lifecycle",
    description:
      "Funds are disbursed and every repayment milestone updates trust signals for future access — transparently on-chain.",
  },
];

export const faqItems: FaqItem[] = [
  {
    question: "What is Kredex?",
    answer:
      "Kredex is a reputation-based micro-lending platform where creditworthiness is driven by real on-chain financial behaviour, not collateral or paid tasks. All loans are settled in Circle USDC on Stellar.",
  },
  {
    question: "Do I need a crypto wallet or seed phrase?",
    answer:
      "No seed phrase needed. You can sign in with a Passkey (Face ID / fingerprint) directly in your browser. Freighter and Albedo are also supported for desktop users.",
  },
  {
    question: "How is the reputation score calculated?",
    answer:
      "The score is stored on Stellar Soroban and reflects repayment history, lending activity, transaction consistency, and KYC tier. It updates automatically after every on-chain event.",
  },
  {
    question: "What currency are loans in?",
    answer:
      "All loans are denominated in Circle USDC — a dollar-pegged stablecoin. On testnet, both USDC and XLM are supported. On mainnet, USDC will be the sole currency.",
  },
  {
    question: "Can lenders monitor risk transparently?",
    answer:
      "Yes. Lenders can inspect borrower reputation scores, KYC tiers, repayment progression, and escrow status — all on-chain with full transparency.",
  },
];

export const footerLinks: FooterLink[] = [
  { label: "How it works", href: "/how-it-works" },
  { label: "P2P",         href: "/p2p" },
  { label: "FAQ",          href: "/faq" },
];

export const testimonials: Testimonial[] = [
  {
    name: "Kwame Osei",
    role: "Freelance Developer",
    review: "Kredex gave me the micro-loan I needed for a new laptop when banks refused because I lacked traditional credit history. Building reputation on-chain is a game changer.",
    avatar: "https://i.pravatar.cc/150?u=a042581f4e29026704d",
  },
  {
    name: "Elena Rodriguez",
    role: "Small Business Owner",
    review: "I started lending my spare USDC on Kredex. The transparency of borrower reputation and the atomic P2P escrow gives me total peace of mind.",
    avatar: "https://i.pravatar.cc/150?u=a04258a2462d826712d",
  },
  {
    name: "David Chen",
    role: "Digital Nomad",
    review: "Borrowing in USDC without dealing with crypto volatility or needing collateral is exactly what I've been looking for. The passkey login makes it incredibly simple.",
    avatar: "https://i.pravatar.cc/150?u=a042581f4e29026024d",
  },
];

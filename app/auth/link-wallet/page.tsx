import { redirect } from "next/navigation";

export default function LinkWalletPage() {
  // Wallet-based passwordless login is now active.
  // Users authenticate via their wallet, so it's always linked.
  redirect("/dashboard");
}

import { requireTradeVaultAdmin } from "@/lib/auth/session";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // This layout strictly enforces that ONLY the admin wallet 
  // can view ANY page inside /dashboard/admin (including Client components).
  await requireTradeVaultAdmin();

  return <>{children}</>;
}

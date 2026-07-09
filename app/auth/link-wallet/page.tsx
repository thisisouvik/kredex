import { requireAuthenticatedUser } from "@/lib/auth/session";
import { LinkWalletClient } from "@/components/auth/LinkWalletClient";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LinkWalletPage() {
  // We use Supabase directly here because requireAuthenticatedUser redirects if no wallet is found
  const supabase = await getServerSupabaseClient();
  if (!supabase) redirect("/auth");

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth");

  const { data: profile } = await supabase.from('profiles').select('wallet_address').eq('id', user.id).maybeSingle();
  
  if (profile?.wallet_address) {
    redirect("/dashboard");
  }

  return <LinkWalletClient userId={user.id} />;
}

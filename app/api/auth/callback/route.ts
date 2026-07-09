import { NextResponse } from 'next/server';
import { getServerSupabaseClient, getServiceRoleClient } from '@/lib/supabase/server';
import { requireAuthenticatedUser } from '@/lib/auth/session';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${requestUrl.origin}/dashboard/borrower/profile?error=${encodeURIComponent(error)}`);
  }

  if (code) {
    const supabase = await getServerSupabaseClient();
    if (supabase) {
      // Exchange code for Supabase session
      const { data, error: authError } = await supabase.auth.exchangeCodeForSession(code);
      
      if (!authError && data?.session?.user) {
        const googleUser = data.session.user;
        const email = googleUser.email;
        const emailConfirmedAt = googleUser.email_confirmed_at;

        if (email) {
          try {
            // Get current logged in wallet user
            const { user: walletUser } = await requireAuthenticatedUser("borrower");
            
            // Link the email to their profiles record
            const srClient = getServiceRoleClient();
            if (srClient) {
               await srClient
                 .from('profiles')
                 .update({
                   email: email,
                   email_confirmed_at: emailConfirmedAt || new Date().toISOString()
                 })
                 .eq('id', walletUser.id);
            }
          } catch (e) {
            console.error("Failed to link Google email to wallet profile:", e);
            // Ignore error if wallet session not found or other issues, just sign out of supabase below
          }
        }
      }
      
      // Sign out of the Supabase session so it doesn't conflict with our custom JWT wallet session
      await supabase.auth.signOut();
    }
  }

  // Redirect back to profile page
  return NextResponse.redirect(`${requestUrl.origin}/dashboard/borrower/profile?linked=true`);
}

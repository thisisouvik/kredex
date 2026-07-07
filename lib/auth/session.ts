import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || 'trustlend-super-secret-jwt-key-change-in-prod';

export async function requireAuthenticatedUser(expectedRole?: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get("trustlend_session")?.value;

  if (!token) {
    redirect("/auth");
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; wallet: string };
    
    return {
      user: {
        id: decoded.sub,
        wallet: decoded.wallet,
        email: decoded.wallet,
        user_metadata: { 
          account_type: 'borrower',
          full_name: 'Wallet User',
          wallet_address: decoded.wallet
        },
        email_confirmed_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        last_sign_in_at: new Date().toISOString(),
      },
      role: 'borrower'
    };
  } catch (error) {
    redirect("/auth");
  }
}

export async function requireTradeVaultAdmin() {
  return await requireAuthenticatedUser();
}
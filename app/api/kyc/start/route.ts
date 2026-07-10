import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { mapToSep12Status } from "@/lib/kyc/sep12";
import jwt from "jsonwebtoken";

const KYC_SESSION_SECRET = process.env.JWT_SECRET as string;
if (!KYC_SESSION_SECRET) throw new Error("JWT_SECRET environment variable is missing. Check your .env file.");

interface ProfileRow {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  date_of_birth?: string | null;
  country_code?: string | null;
  kyc_status?: string | null;
  kyc_tier?: number | null;
  government_id_url?: string | null;
  kyc_submitted_at?: string | null;
  kyc_rejection_reason?: string | null;
}


/**
 * POST /api/kyc/start
 *
 * Initiates a KYC session for the authenticated user.
 * Returns:
 *  - Current KYC status (so the UI knows whether to show the form or status)
 *  - A short-lived `kyc_session_token` (15 min) that authorises the PUT /api/kyc/customer call
 *  - Pre-filled profile data (if any) so the form can be partially filled
 *
 * This endpoint replaces the previous 503 stub.
 */
export async function POST(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();

    const supabase = await getServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: rawProfile } = await supabase
      .from("profiles")
      .select(
        "id, full_name, phone, date_of_birth, country_code, kyc_status, kyc_tier, " +
        "government_id_url, kyc_submitted_at, kyc_rejection_reason"
      )
      .eq("id", user.id)
      .maybeSingle();

    const profile = rawProfile as ProfileRow | null;

    const internalStatus = profile?.kyc_status ?? "pending";
    const sep12Status = mapToSep12Status(internalStatus);

    // Issue a short-lived session token for the KYC form
    const kycToken = jwt.sign(
      { sub: user.id, wallet: user.wallet, purpose: "kyc_session" },
      KYC_SESSION_SECRET,
      { expiresIn: "15m" }
    );

    // Split full_name into first/last for the form
    const nameParts = (profile?.full_name ?? "").trim().split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ");

    return NextResponse.json({
      status: sep12Status,
      kyc_tier: Number(profile?.kyc_tier ?? 0),
      kyc_submitted_at: profile?.kyc_submitted_at ?? null,
      rejection_reason: profile?.kyc_rejection_reason ?? null,
      kyc_session_token: kycToken,
      // Pre-fill fields so user doesn't retype known data
      prefill: {
        first_name: firstName,
        last_name: lastName,
        birth_date: profile?.date_of_birth ?? null,
        country_code: profile?.country_code ?? null,
        phone_number: profile?.phone ?? null,
        has_id_document: Boolean(profile?.government_id_url),
      },
      // SEP-12 endpoint the form should PUT to
      sep12_endpoint: "/api/kyc/customer",
    });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

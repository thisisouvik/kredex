import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import { mapToSep12Status } from "@/lib/kyc/sep12";
import jwt from "jsonwebtoken";

const KYC_SESSION_SECRET = process.env.JWT_SECRET as string;
if (!KYC_SESSION_SECRET) throw new Error("JWT_SECRET environment variable is missing. Check your .env file.");

/**
 * POST /api/kyc/start
 *
 * Initiates a KYC session for the authenticated user.
 * Returns:
 *  - Current KYC status (so the UI knows whether to show the form or status)
 *  - A short-lived `kyc_session_token` (15 min) that authorises the PUT /api/kyc/customer call
 *  - Pre-filled profile data (if any) so the form can be partially filled
 */
export async function POST(_req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        fullName: true,
        phone: true,
        dateOfBirth: true,
        countryCode: true,
        kycStatus: true,
        kycTier: true,
        kycIpfsCid: true,
        kycSubmittedAt: true,
      }
    });

    const internalStatus = profile?.kycStatus ?? "pending";
    const sep12Status = mapToSep12Status(internalStatus);

    // Issue a short-lived session token for the KYC form
    const kycToken = jwt.sign(
      { sub: user.id, wallet: user.wallet, purpose: "kyc_session" },
      KYC_SESSION_SECRET,
      { expiresIn: "15m" }
    );

    // Split full_name into first/last for the form
    const nameParts = (profile?.fullName ?? "").trim().split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ");

    return NextResponse.json({
      status: sep12Status,
      kyc_tier: profile?.kycTier ?? 0,
      kyc_submitted_at: profile?.kycSubmittedAt ?? null,
      rejection_reason: null, // Prisma schema no longer stores this natively
      kyc_session_token: kycToken,
      // Pre-fill fields so user doesn't retype known data
      prefill: {
        first_name: firstName,
        last_name: lastName,
        birth_date: profile?.dateOfBirth ?? null,
        country_code: profile?.countryCode ?? null,
        phone_number: profile?.phone ?? null,
        has_id_document: Boolean(profile?.kycIpfsCid),
      },
      // SEP-12 endpoint the form should PUT to
      sep12_endpoint: "/api/kyc/customer",
    });
  } catch (_err) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

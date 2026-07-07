import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import { getServerSupabaseClient, getServiceRoleClient } from "@/lib/supabase/server";
import {
  mapToSep12Status,
  buildRequiredFields,
  buildProvidedFields,
  buildStatusMessage,
  validateSep12Payload,
  type Sep12CustomerResponse,
} from "@/lib/kyc/sep12";

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
 * GET /api/kyc/customer
 *
 * SEP-12 compatible endpoint. Returns the KYC status of the authenticated user.
 * Can also be queried by Stellar anchors using ?account=<stellar_address> with
 * an Authorization: Bearer <Kredex_jwt> header.
 *
 * SEP-12 spec: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0012.md
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();
    const supabase = await getServerSupabaseClient();

    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    const { data: rawProfile, error } = await supabase
      .from("profiles")
      .select(
        "id, full_name, phone, date_of_birth, country_code, kyc_status, kyc_tier, " +
        "government_id_url, kyc_submitted_at, kyc_rejection_reason"
      )
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("[SEP-12 GET] Supabase error:", error);
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
    }

    const profile = rawProfile as ProfileRow | null;
    const internalStatus = profile?.kyc_status ?? "pending";
    const sep12Status = mapToSep12Status(internalStatus);
    const requiredFields = buildRequiredFields(profile ?? {});
    const providedFields = buildProvidedFields(profile ?? {});
    const message = buildStatusMessage(sep12Status, profile?.kyc_rejection_reason);

    const response: Sep12CustomerResponse = {
      id: user.id,
      status: sep12Status,
      message,
      ...(Object.keys(providedFields).length > 0 && { provided_fields: providedFields }),
      ...(requiredFields && { fields: requiredFields }),
      // Kredex extensions
      kyc_tier: Number(profile?.kyc_tier ?? 0),
    };

    return NextResponse.json(response, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  } catch {
    return NextResponse.redirect(new URL("/auth", req.url));
  }
}

/**
 * PUT /api/kyc/customer
 *
 * SEP-12 compatible endpoint for submitting or updating KYC information.
 * Accepts JSON body with: first_name, last_name (or full_name), birth_date,
 * country_code, phone_number (optional), photo_id_front (optional base64 URL).
 *
 * Sets kycStatus → SUBMITTED and triggers admin review flow.
 */
export async function PUT(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    // Validate required fields per SEP-12
    const missingFields = validateSep12Payload(body);
    if (missingFields.length > 0) {
      return NextResponse.json(
        {
          error: "Missing required fields",
          fields: Object.fromEntries(
            missingFields.map((f) => [f, { description: `${f} is required` }])
          ),
        },
        { status: 400 }
      );
    }

    // Build full_name from parts if provided separately
    const fullName =
      (body.full_name as string) ??
      `${body.first_name ?? ""} ${body.last_name ?? ""}`.trim();

    const supabase = await getServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }

    // Check for existing profile
    const { data: existing } = await supabase
      .from("profiles")
      .select("id, kyc_status")
      .eq("id", user.id)
      .maybeSingle();

    // Don't allow re-submission if already VERIFIED
    if (existing?.kyc_status === "verified") {
      return NextResponse.json(
        {
          id: user.id,
          status: "ACCEPTED",
          message: "Your identity has already been verified.",
          kyc_tier: 2,
        },
        { status: 200 }
      );
    }

    const updates: Record<string, unknown> = {
      full_name: fullName || null,
      date_of_birth: (body.birth_date as string) ?? (body.date_of_birth as string) ?? null,
      country_code: (body.country_code as string) ?? null,
      phone: (body.phone_number as string) ?? (body.phone as string) ?? null,
      kyc_status: "submitted",
      kyc_submitted_at: new Date().toISOString(),
    };

    // If a photo_id_front URL is provided (e.g. after a separate upload)
    if (body.photo_id_front && typeof body.photo_id_front === "string") {
      updates.government_id_url = body.photo_id_front;
    }

    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...updates }, { onConflict: "id" });

    if (upsertError) {
      console.error("[SEP-12 PUT] Upsert error:", upsertError);
      return NextResponse.json({ error: "Failed to save KYC data" }, { status: 500 });
    }

    // Notify admin via service role (create notification) — fire and forget
    const srClient = getServiceRoleClient();
    if (srClient) {
      void Promise.resolve(
        srClient.from("notifications").insert({
          user_id: user.id,
          type: "kyc_submitted",
          title: "KYC Submitted",
          message: `${fullName} has submitted identity documents for review.`,
          read: false,
          created_at: new Date().toISOString(),
        })
      ).catch(() => {});
    }

    const response: Sep12CustomerResponse = {
      id: user.id,
      status: "PROCESSING",
      message: "Your documents have been submitted and are under review. This typically takes 1-2 business days.",
      kyc_tier: 0,
    };

    return NextResponse.json(response, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

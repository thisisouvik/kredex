import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";
import {
  mapToSep12Status,
  buildRequiredFields,
  buildProvidedFields,
  buildStatusMessage,
  validateSep12Payload,
  type Sep12CustomerResponse,
} from "@/lib/kyc/sep12";

/**
 * GET /api/kyc/customer
 *
 * SEP-12 compatible endpoint. Returns the KYC status of the authenticated user.
 */
export async function GET(req: NextRequest) {
  try {
    const { user } = await requireAuthenticatedUser();

    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        id: true,
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

    if (!profile) {
      return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
    }

    const internalStatus = profile.kycStatus ?? "pending";
    const sep12Status = mapToSep12Status(internalStatus);
    
    // Map to expected keys for helper functions
    const mappedProfile = {
      full_name: profile.fullName,
      phone: profile.phone,
      date_of_birth: profile.dateOfBirth?.toISOString(),
      country_code: profile.countryCode,
      government_id_url: profile.kycIpfsCid
    };

    const requiredFields = buildRequiredFields(mappedProfile);
    const providedFields = buildProvidedFields(mappedProfile);
    const message = buildStatusMessage(sep12Status, null); // Rejection reason omitted as it's not in schema

    const response: Sep12CustomerResponse = {
      id: user.id,
      status: sep12Status,
      message,
      ...(Object.keys(providedFields).length > 0 && { provided_fields: providedFields }),
      ...(requiredFields && { fields: requiredFields }),
      kyc_tier: profile.kycTier ?? 0,
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

    const fullName =
      (body.full_name as string) ??
      `${body.first_name ?? ""} ${body.last_name ?? ""}`.trim();

    const existing = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, kycStatus: true }
    });

    if (existing?.kycStatus === "verified") {
      return NextResponse.json(
        {
          id: user.id,
          status: "ACCEPTED",
          message: "Your identity has already been verified.",
          kyc_tier: 2, // Could map from DB if using multiple tiers
        },
        { status: 200 }
      );
    }

    const dateStr = (body.birth_date as string) ?? (body.date_of_birth as string);
    const updates: Record<string, unknown> = {
      fullName: fullName || null,
      dateOfBirth: dateStr ? new Date(dateStr) : null,
      countryCode: (body.country_code as string) ?? null,
      phone: (body.phone_number as string) ?? (body.phone as string) ?? null,
      kycStatus: "submitted",
      kycSubmittedAt: new Date(),
    };

    if (body.photo_id_front && typeof body.photo_id_front === "string") {
      // In this system, kycIpfsCid usually holds the CID. 
      // If a full URL is passed here, we store it.
      updates.kycIpfsCid = body.photo_id_front;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updates
    });

    // Notify admin
    const adminUser = await prisma.user.findFirst({ where: { role: "admin" }});
    if (adminUser) {
      const { createNotification } = await import("@/lib/notifications");
      await createNotification({
        userId: adminUser.id,
        title: "KYC Submitted",
        message: `${fullName} has submitted identity documents for review.`,
      });
    }

    const response: Sep12CustomerResponse = {
      id: user.id,
      status: "PROCESSING",
      message: "Your documents have been submitted and are under review. This typically takes 1-2 business days.",
      kyc_tier: 0,
    };

    return NextResponse.json(response, { status: 202 });
  } catch (_err) {
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

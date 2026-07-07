import { NextResponse } from "next/server";

/**
 * KYC Start — Persona Integration
 *
 * This endpoint will create a Persona inquiry session and return
 * the session token for the embedded Persona flow.
 *
 * STATUS: Coming Soon — Pending business email verification with Persona.
 * Once verified, replace this stub with actual Persona API calls.
 */
export async function POST() {
  return NextResponse.json(
    {
      status: "coming_soon",
      message:
        "Identity verification via Persona is coming soon. We are completing our business onboarding with Persona.",
    },
    { status: 503 }
  );
}

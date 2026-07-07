/**
 * lib/kyc/sep12.ts
 *
 * Helpers for SEP-12 KYC protocol compliance.
 * SEP-12 spec: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0012.md
 *
 * Kredex acts as its own SEP-12 KYC server. This means a borrower verified
 * on Kredex is recognized by any compliant Stellar anchor querying our endpoint.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type Sep12Status =
  | "NEEDS_INFO"
  | "PROCESSING"
  | "ACCEPTED"
  | "REJECTED";

export interface Sep12Field {
  type: "string" | "binary" | "date" | "number";
  description: string;
  optional?: boolean;
}

export interface Sep12CustomerResponse {
  id: string;
  status: Sep12Status;
  fields?: Record<string, Sep12Field>;
  provided_fields?: Record<string, { type: string; status: "ACCEPTED" | "PROCESSING" | "REJECTED"; description?: string }>;
  message?: string;
  error?: string;
  /** Kredex extension: kyc_tier (0=None, 1=Soft, 2=Full) */
  kyc_tier?: number;
  /** Kredex extension: reputation_score */
  reputation_score?: number;
}

export type InternalKycStatus = "pending" | "submitted" | "verified" | "rejected";

// ─── Required fields per SEP-12 spec ─────────────────────────────────────────

export const REQUIRED_KYC_FIELDS: Record<string, Sep12Field> = {
  first_name: { type: "string", description: "Legal first name" },
  last_name: { type: "string", description: "Legal last name" },
  birth_date: { type: "date", description: "Date of birth (YYYY-MM-DD)" },
  country_code: { type: "string", description: "ISO 3166-1 alpha-2 country code" },
  photo_id_front: { type: "binary", description: "Government-issued photo ID (front)" },
};

export const OPTIONAL_KYC_FIELDS: Record<string, Sep12Field> = {
  photo_id_back: { type: "binary", description: "Government-issued photo ID (back)", optional: true },
  phone_number: { type: "string", description: "Phone number with country code", optional: true },
};

// ─── Status mapping ───────────────────────────────────────────────────────────

/**
 * Maps internal Kredex KYC status to SEP-12 status string.
 */
export function mapToSep12Status(internalStatus: string): Sep12Status {
  switch (internalStatus?.toLowerCase()) {
    case "verified":   return "ACCEPTED";
    case "submitted":  return "PROCESSING";
    case "rejected":   return "REJECTED";
    default:           return "NEEDS_INFO"; // pending / unknown
  }
}

/**
 * Builds the SEP-12 `fields` object (what is still required).
 * Returns undefined if all required fields are already provided.
 */
export function buildRequiredFields(
  profile: {
    full_name?: string | null;
    date_of_birth?: string | null;
    country_code?: string | null;
    government_id_url?: string | null;
  }
): Record<string, Sep12Field> | undefined {
  const missing: Record<string, Sep12Field> = {};

  const [firstName, ...rest] = (profile.full_name ?? "").trim().split(" ");
  if (!firstName) missing.first_name = REQUIRED_KYC_FIELDS.first_name;
  if (!rest.length) missing.last_name = REQUIRED_KYC_FIELDS.last_name;
  if (!profile.date_of_birth) missing.birth_date = REQUIRED_KYC_FIELDS.birth_date;
  if (!profile.country_code)  missing.country_code = REQUIRED_KYC_FIELDS.country_code;
  if (!profile.government_id_url) missing.photo_id_front = REQUIRED_KYC_FIELDS.photo_id_front;

  return Object.keys(missing).length > 0 ? missing : undefined;
}

/**
 * Builds the SEP-12 `provided_fields` object (what has been submitted).
 */
export function buildProvidedFields(
  profile: {
    full_name?: string | null;
    date_of_birth?: string | null;
    country_code?: string | null;
    government_id_url?: string | null;
    phone?: string | null;
    kyc_status?: string | null;
  }
): Record<string, { type: string; status: "ACCEPTED" | "PROCESSING" | "REJECTED"; description?: string }> {
  const provided: Record<string, { type: string; status: "ACCEPTED" | "PROCESSING" | "REJECTED" }> = {};
  const fieldStatus = mapToSep12Status(profile.kyc_status ?? "pending");
  const docStatus: "ACCEPTED" | "PROCESSING" | "REJECTED" =
    fieldStatus === "ACCEPTED" ? "ACCEPTED" :
    fieldStatus === "REJECTED" ? "REJECTED" : "PROCESSING";

  const [firstName, ...rest] = (profile.full_name ?? "").trim().split(" ");
  if (firstName) provided.first_name = { type: "string", status: docStatus };
  if (rest.length) provided.last_name = { type: "string", status: docStatus };
  if (profile.date_of_birth) provided.birth_date = { type: "date", status: docStatus };
  if (profile.country_code) provided.country_code = { type: "string", status: docStatus };
  if (profile.government_id_url) provided.photo_id_front = { type: "binary", status: docStatus };
  if (profile.phone) provided.phone_number = { type: "string", status: docStatus };

  return provided;
}

/**
 * Returns a human-readable status message for the SEP-12 response.
 */
export function buildStatusMessage(status: Sep12Status, rejectionReason?: string | null): string {
  switch (status) {
    case "ACCEPTED":    return "Your identity has been verified. You can access all Kredex borrowing tiers.";
    case "PROCESSING":  return "Your documents are under review. This typically takes 1-2 business days.";
    case "REJECTED":    return rejectionReason ?? "Your verification was not approved. Please contact support.";
    default:            return "Please complete identity verification to unlock borrowing.";
  }
}

/**
 * Validates that a PUT /kyc/customer request body has the minimum required fields.
 * Returns an array of missing field names (empty = valid).
 */
export function validateSep12Payload(body: Record<string, unknown>): string[] {
  const missing: string[] = [];
  if (!body.first_name && !body.last_name && !body.full_name) {
    missing.push("first_name", "last_name");
  }
  if (!body.birth_date && !body.date_of_birth) missing.push("birth_date");
  if (!body.country_code) missing.push("country_code");
  // photo_id_front is optional on PUT (can be uploaded via multipart separately)
  return missing;
}

/**
 * Passkey Wallet — Native WebAuthn Implementation for Kredex
 *
 * Uses the browser's built-in WebAuthn API (Face ID / Touch ID / fingerprint).
 * No seed phrase. No extension required. Works on all modern mobile browsers.
 *
 * How it works:
 *   1. Registration: `registerPasskey()`  → creates a device-bound keypair,
 *      returns a credentialId and a base64 public key we store server-side.
 *   2. Authentication: `authenticatePasskey()` → prompts biometric, signs the
 *      server-issued nonce, returns the assertion for server verification.
 *
 * The `credentialId` is stored in localStorage to identify returning users.
 */

const CREDENTIAL_STORAGE_KEY = "Kredex_passkey_credential_id";
const RP_NAME = "Kredex";

/** Returns true only when WebAuthn with platform authenticator is available */
export async function isPasskeySupported(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!window.PublicKeyCredential) return false;
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function getStoredCredentialId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(CREDENTIAL_STORAGE_KEY);
}

function storeCredentialId(id: string) {
  localStorage.setItem(CREDENTIAL_STORAGE_KEY, id);
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function base64UrlDecode(str: string): ArrayBuffer {
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

export interface PasskeyRegistrationResult {
  credentialId: string;          // base64url — unique device credential identifier
  publicKeyBase64: string;       // base64url — raw COSE public key bytes
  walletHandle: string;          // "pk_<credentialId_prefix>" — used as wallet address in Kredex
}

/**
 * Register a new passkey on this device.
 * Called once on first-time sign-up.
 */
export async function registerPasskey(userDisplayName: string): Promise<PasskeyRegistrationResult> {
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: {
        name: RP_NAME,
        id: window.location.hostname,
      },
      user: {
        id: userId,
        name: userDisplayName,
        displayName: userDisplayName,
      },
      pubKeyCredParams: [
        { alg: -7, type: "public-key" },   // ES256 (preferred)
        { alg: -257, type: "public-key" }, // RS256 (fallback)
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",          // Use device biometrics
        requireResidentKey: true,                     // Store on device
        userVerification: "required",                 // Require biometric
      },
      timeout: 60_000,
      attestation: "none",
    },
  }) as PublicKeyCredential;

  const response = credential.response as AuthenticatorAttestationResponse;
  const credentialId = base64UrlEncode(credential.rawId);
  const publicKeyBase64 = base64UrlEncode(response.getPublicKey()!);

  storeCredentialId(credentialId);

  return {
    credentialId,
    publicKeyBase64,
    walletHandle: `pk_${credentialId.slice(0, 24)}`,
  };
}

export interface PasskeyAuthResult {
  credentialId: string;
  clientDataJSON: string;     // base64url
  authenticatorData: string;  // base64url
  signature: string;          // base64url — the actual WebAuthn assertion signature
}

/**
 * Authenticate with an existing passkey.
 * The `nonce` from /api/auth/challenge is used as the WebAuthn challenge.
 */
export async function authenticatePasskey(nonce: string, credentialId?: string): Promise<PasskeyAuthResult> {
  const challengeBuffer = new TextEncoder().encode(nonce);

  const allowCredentials: PublicKeyCredentialDescriptor[] = credentialId
    ? [{ id: base64UrlDecode(credentialId), type: "public-key" }]
    : [];

  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: challengeBuffer,
      rpId: window.location.hostname,
      allowCredentials,
      userVerification: "required",
      timeout: 60_000,
    },
  }) as PublicKeyCredential;

  const response = assertion.response as AuthenticatorAssertionResponse;

  return {
    credentialId: base64UrlEncode(assertion.rawId),
    clientDataJSON: base64UrlEncode(response.clientDataJSON),
    authenticatorData: base64UrlEncode(response.authenticatorData),
    signature: base64UrlEncode(response.signature),
  };
}

/**
 * lib/ipfs/pinata.ts
 *
 * Helper for uploading KYC documents to Pinata IPFS.
 * Only the IPFS CID (Content Identifier) is stored in the database —
 * the actual file lives on the decentralised IPFS network via Pinata's
 * pinning service, making it immutable and censorship-resistant.
 *
 * Required env vars:
 *   PINATA_API_KEY
 *   PINATA_API_SECRET
 *   PINATA_GATEWAY_URL  (e.g. https://gateway.pinata.cloud)
 */

const PINATA_API_URL = "https://api.pinata.cloud";
const PINATA_API_KEY = process.env.PINATA_API_KEY!;
const PINATA_API_SECRET = process.env.PINATA_API_SECRET!;
export const PINATA_GATEWAY = process.env.PINATA_GATEWAY_URL ?? "https://gateway.pinata.cloud";

export interface PinataUploadResult {
  cid: string;           // IPFS CID (e.g. QmXyz...)
  url: string;           // Full gateway URL to access the file
  filename: string;
  size: number;
}

/**
 * Upload a file buffer to Pinata IPFS.
 * Returns the IPFS CID and a public gateway URL.
 */
export async function uploadToIPFS(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  metadata?: Record<string, string>
): Promise<PinataUploadResult> {
  if (!PINATA_API_KEY || !PINATA_API_SECRET) {
    throw new Error("PINATA_API_KEY and PINATA_API_SECRET must be set in environment variables.");
  }

  const formData = new FormData();

  // Attach the file
  const blob = new Blob([new Uint8Array(fileBuffer)], { type: mimeType });
  formData.append("file", blob, filename);

  // Attach pinata metadata (stored alongside the pin for searchability)
  const pinataMetadata = JSON.stringify({
    name: filename,
    keyvalues: {
      purpose: "kyc",
      ...metadata,
    },
  });
  formData.append("pinataMetadata", pinataMetadata);

  // Pin options
  const pinataOptions = JSON.stringify({ cidVersion: 1 });
  formData.append("pinataOptions", pinataOptions);

  const response = await fetch(`${PINATA_API_URL}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Pinata upload failed (${response.status}): ${errorText}`);
  }

  const result = await response.json() as { IpfsHash: string; PinSize: number };

  const cid = result.IpfsHash;
  const url = `${PINATA_GATEWAY}/ipfs/${cid}`;

  return { cid, url, filename, size: result.PinSize };
}

/**
 * Get the public IPFS URL for a stored CID.
 */
export function getIPFSUrl(cid: string): string {
  return `${PINATA_GATEWAY}/ipfs/${cid}`;
}

/**
 * Unpin a file from Pinata (for GDPR right-to-erasure compliance).
 * Note: This removes Pinata's pin but the CID may persist on other IPFS nodes.
 */
export async function unpinFromIPFS(cid: string): Promise<void> {
  const response = await fetch(`${PINATA_API_URL}/pinning/unpin/${cid}`, {
    method: "DELETE",
    headers: {
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_API_SECRET,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Pinata unpin failed (${response.status})`);
  }
}

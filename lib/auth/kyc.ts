/**
 * KYC (Know Your Customer) verification helpers
 * Manages identity verification status and document storage
 */

import prisma from "@/lib/prisma";

export type KYCStatus = "pending" | "submitted" | "verified" | "rejected";

export interface KYCData {
  status: KYCStatus;
  government_id_ipfs_hash?: string;
  government_id_url?: string;
  submitted_at?: string;
  verified_at?: string;
  rejection_reason?: string;
}

/**
 * Store KYC document hash after IPFS upload
 */
export async function storeKYCDocument(
  userId: string,
  ipfsHash: string,
  _ipfsUrl: string // Unused in new schema directly, just using ipfsHash
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: {
      kycIpfsCid: ipfsHash,
      kycStatus: "submitted",
      kycSubmittedAt: new Date(),
    }
  });
}

/**
 * Get KYC data for a user (admin only)
 */
export async function getKYCData(userId: string): Promise<KYCData | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      kycStatus: true,
      kycIpfsCid: true,
      kycSubmittedAt: true,
      // Verified at and rejection reason are not currently stored natively in the simplified schema,
      // but they can be inferred or derived if added back.
    }
  });

  if (!user) return null;

  return {
    status: user.kycStatus as KYCStatus,
    government_id_ipfs_hash: user.kycIpfsCid ?? undefined,
    government_id_url: user.kycIpfsCid ? `https://gateway.pinata.cloud/ipfs/${user.kycIpfsCid}` : undefined,
    submitted_at: user.kycSubmittedAt?.toISOString(),
  };
}

/**
 * Check if user is verified (admin checker)
 */
export async function isUserVerified(userId: string): Promise<boolean> {
  const kycData = await getKYCData(userId);
  return kycData?.status === "verified";
}

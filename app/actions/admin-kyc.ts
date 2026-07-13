"use server";

/**
 * Admin KYC verification actions
 * Only admins can verify/reject user identity documents
 */

import prisma from "@/lib/prisma";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { PINATA_GATEWAY } from "@/lib/ipfs/pinata";

export async function verifyKYCDocument(
  userId: string,
  approved: boolean,
  _rejectionReason?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return { success: false, error: "Not authenticated" };

    const ADMIN_WALLET = process.env.ADMIN_WALLET_ADDRESS;
    if (!ADMIN_WALLET || session.user.wallet !== ADMIN_WALLET) {
      return { success: false, error: "Unauthorized: Admin access required" };
    }

    const updateData: Record<string, unknown> = approved
      ? {
          kycStatus: "verified",
          kycTier: 1,
        }
      : {
          kycStatus: "rejected",
          // The schema doesn't have kycRejectionReason, but we can notify the user via another channel
        };

    // When KYC is approved, calculate an initial reputation score.
    if (approved) {
      const userProfile = await prisma.user.findUnique({
        where: { id: userId },
        select: { fullName: true, phone: true, dateOfBirth: true }
      });

      let initialScore = 70;
      if (userProfile?.fullName?.trim()) initialScore += 15;
      if (userProfile?.phone?.trim()) initialScore += 15;
      if (userProfile?.dateOfBirth) initialScore += 10;
      
      updateData.reputationScore = initialScore;
    }

    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    console.log(`✅ KYC ${approved ? "approved" : "rejected"} for user ${userId}`);
    return { success: true };
  } catch (error) {
    console.error("❌ KYC verification failed:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Verification failed",
    };
  }
}

export async function getPendingKYCDocuments(): Promise<
  Array<{
    id: string;
    email: string;
    full_name: string;
    kyc_status: string;
    government_id_url: string;
    submitted_at: string;
  }> | null
> {
  try {
    const session = await getAuthenticatedUser();
    if (!session) return null;

    const ADMIN_WALLET = process.env.ADMIN_WALLET_ADDRESS;
    if (!ADMIN_WALLET || session.user.wallet !== ADMIN_WALLET) {
      return null;
    }

    const data = await prisma.user.findMany({
      where: {
        kycStatus: { in: ["submitted", "verified", "rejected"] }
      },
      select: {
        id: true,
        fullName: true,
        kycStatus: true,
        kycIpfsCid: true,
        kycSubmittedAt: true,
      },
      orderBy: { kycSubmittedAt: "desc" }
    });

    // Map Prisma models to the expected return type
    const docs = data.map((doc) => {
      // Pinata gateway URL structure for the frontend
      const viewUrl = doc.kycIpfsCid ? `${PINATA_GATEWAY}/ipfs/${doc.kycIpfsCid}` : "";

      return {
        id: doc.id,
        email: "hidden", // We dropped email storage to focus on wallet auth
        full_name: doc.fullName || "Unknown",
        kyc_status: doc.kycStatus || "pending",
        government_id_url: viewUrl,
        submitted_at: doc.kycSubmittedAt ? doc.kycSubmittedAt.toISOString() : new Date().toISOString(),
      };
    });

    return docs;
  } catch (error) {
    console.error("❌ Failed to fetch KYC documents:", error);
    return null;
  }
}

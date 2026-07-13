"use server";

/**
 * Server Action: Handle KYC document upload
 * Validates user, uploads to Pinata IPFS, stores reference in database
 */

import { requireAuthenticatedUser } from "@/lib/auth/session";
import { uploadToIPFS } from "@/lib/ipfs/pinata";
import prisma from "@/lib/prisma";

export async function uploadKYCDocument(formData: FormData): Promise<{
  success: boolean;
  path?: string;
  error?: string;
}> {
  try {
    // 1. Authenticate user
    const { user: authUser } = await requireAuthenticatedUser();
    const user = await prisma.user.findUnique({ where: { id: authUser.id } });
    
    if (!user) {
      return { success: false, error: "Not authenticated" };
    }

    // 2. Get file from form
    const file = formData.get("government_id") as File | null;
    if (!file) {
      return { success: false, error: "No file provided" };
    }

    // 3. Validate file type and size
    const validTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      return {
        success: false,
        error: "Invalid file type. Please upload JPG, PNG, WebP, or PDF.",
      };
    }

    if (file.size > 10 * 1024 * 1024) {
      // 10MB limit
      return { success: false, error: "File too large. Maximum 10MB allowed." };
    }

    // 4. Upload to Pinata IPFS
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = `government_id_${Date.now()}_${Math.random().toString(36).substring(7)}_${file.name}`;

    console.log(`📤 Uploading ${filename} to Pinata IPFS`);

    const uploadResult = await uploadToIPFS(buffer, filename, file.type, {
      userId: user.id,
      role: user.role
    });

    console.log(`✅ Uploaded to IPFS. CID: ${uploadResult.cid}`);

    // 5. Update user in NeonDB
    await prisma.user.update({
      where: { id: user.id },
      data: {
        kycIpfsCid: uploadResult.cid,
        kycIpfsFilename: filename,
        kycSubmittedAt: new Date(),
        kycStatus: "submitted",
      },
    });

    return { success: true, path: uploadResult.url };
  } catch (error: any) {
    console.error("KYC upload error:", error);
    return { success: false, error: error.message || "Failed to upload KYC document." };
  }
}

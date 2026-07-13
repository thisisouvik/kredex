"use server";

import { requireAuthenticatedUser } from "@/lib/auth/session";
import prisma from "@/lib/prisma";

interface ProfileUpdatePayload {
  full_name: string;
  phone: string;
  date_of_birth?: string;
  email?: string;
}

interface ProfileUpdateResult {
  success: boolean;
  error?: string;
}

export async function updateUserProfile(
  payload: ProfileUpdatePayload
): Promise<ProfileUpdateResult> {
  try {
    // 1. Authenticate user
    const { user: authUser } = await requireAuthenticatedUser();
    const user = await prisma.user.findUnique({ where: { id: authUser.id } });
    if (!user) {
      return { success: false, error: "User not found." };
    }

    // 2. Validate required fields
    const name = payload.full_name?.trim() ?? "";
    const phone = payload.phone?.trim() ?? "";
    const email = payload.email?.trim() ?? "";

    if (name.length < 2) {
      return { success: false, error: "Full legal name must be at least 2 characters." };
    }
    if (phone.length < 7) {
      return { success: false, error: "Please enter a valid phone number." };
    }

    const updates: import("@prisma/client").Prisma.UserUpdateInput = {
      fullName: name,
      phone: phone,
    };

    if (payload.date_of_birth && payload.date_of_birth.trim() !== "") {
      const dob = new Date(payload.date_of_birth);
      const eighteenYearsAgo = new Date();
      eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);

      if (isNaN(dob.getTime())) {
        return { success: false, error: "Invalid date of birth." };
      }
      if (dob > eighteenYearsAgo) {
        return { success: false, error: "You must be at least 18 years old." };
      }
      updates.dateOfBirth = dob;
    } else {
      updates.dateOfBirth = null;
    }

    if (email && email !== user.email) {
      // Check 24-hour edit limit
      if (user.emailUpdatedAt && (Date.now() - user.emailUpdatedAt.getTime() < 24 * 60 * 60 * 1000)) {
        return { success: false, error: "Email can only be updated once every 24 hours." };
      }
      updates.email = email;
      updates.emailUpdatedAt = new Date();
    }

    await prisma.user.update({
      where: { id: user.id },
      data: updates,
    });

    return { success: true };
  } catch (err: unknown) {
    console.error("Profile update error:", err);
    return { success: false, error: "Internal server error during update." };
  }
}

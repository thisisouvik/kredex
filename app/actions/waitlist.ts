"use server";

import prisma from "@/lib/prisma";

export async function joinWaitlist(email: string, fullName: string) {
  try {
    await prisma.waitlist.create({
      data: {
        email,
        fullName,
      },
    });
    return { success: true };
  } catch (err: unknown) {
    const error = err as { code?: string, message?: string };
    if (error.code === "P2002") {
      return { success: true }; // Ignore unique constraint violation (already on list)
    }
    console.error("Waitlist error:", err);
    return { success: false, error: error.message || "Failed to join waitlist" };
  }
}

import prisma from "@/lib/prisma";

export async function createNotification({
  userId,
  title,
  message,
}: {
  userId: string;
  title: string;
  message: string;
}) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        title,
        message,
      }
    });
  } catch (err) {
    console.error("Error creating notification", err);
  }
}

"use client";

import { useEffect, useRef } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { useAlert } from "@/components/ui/AlertProvider";

export function RealtimeNotifications() {
  const { showAlert } = useAlert();
  const isConnected = useRef(false);

  useEffect(() => {
    if (isConnected.current) return;
    
    const supabase = getBrowserSupabaseClient();
    if (!supabase) return;

    let userId: string | undefined;

    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      userId = session.user.id;

      const channel = supabase
        .channel("realtime-notifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notifications",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const newNotification = payload.new as Record<string, unknown>;
            
            // Trigger the global bottom-right alert
            showAlert(
              (newNotification.title as string) || "New Notification",
              (newNotification.message as string) || "",
              "success",
              6000
            );

            // Dispatch a custom event so NotificationWidget can update its unread count without a reload
            window.dispatchEvent(new CustomEvent("new_notification", { detail: newNotification }));
          }
        )
        .subscribe();

      isConnected.current = true;
    };

    setupRealtime();

    return () => {
      if (isConnected.current) {
        supabase.removeAllChannels();
        isConnected.current = false;
      }
    };
  }, [showAlert]);

  return null; // This component is strictly logical and renders nothing
}

"use client";

import { useEffect, Suspense } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useAlert } from "@/components/ui/AlertProvider";

function UrlAlertsInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { showAlert } = useAlert();

  useEffect(() => {
    if (!searchParams || !pathname) return;

    const linked = searchParams.get("linked");
    const error = searchParams.get("error");
    
    let hasAlert = false;

    if (linked === "true") {
      showAlert("Account Linked", "Your Google account has been successfully linked to your wallet.", "success", 5000);
      hasAlert = true;
    } else if (error) {
      showAlert("Authentication Error", decodeURIComponent(error), "error", 5000);
      hasAlert = true;
    }

    if (hasAlert) {
      // Clean up the URL so the alert doesn't show again on refresh
      router.replace(pathname, { scroll: false });
    }
  }, [searchParams, pathname, router, showAlert]);

  return null;
}

export function UrlAlerts() {
  return (
    <Suspense fallback={null}>
      <UrlAlertsInner />
    </Suspense>
  );
}

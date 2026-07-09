import { NextRequest, NextResponse } from "next/server";
import { getServerSupabaseClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth/session";

export async function GET(_request: NextRequest) {
  try {
    const supabase = await getServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    }

    const authData = await getAuthenticatedUser();
    if (!authData?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const user = authData.user;

    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(user.id);
    if (!isUUID) {
      return NextResponse.json({ notifications: [] }, { status: 200 });
    }

    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.warn("Notifications fetch error (table might not exist):", error);
      return NextResponse.json({ notifications: [] }, { status: 200 });
    }

    return NextResponse.json({ notifications: data }, { status: 200 });
  } catch (_error) {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

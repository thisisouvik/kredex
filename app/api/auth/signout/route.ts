import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  // We accept GET so that we can easily redirect to this route from Server Components
  const cookieStore = await cookies();
  cookieStore.delete("Kredex_session");

  // Optional: clear Supabase auth cookies if they exist
  // We do this by expiring them
  const response = NextResponse.redirect(new URL("/auth", request.url));
  
  // Hard delete the cookie by setting it on the response as well, just to be absolutely sure
  response.cookies.delete("Kredex_session");
  
  return response;
}

import { createClient } from "@supabase/supabase-js";

// Uses the environment variables from .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase URL or Service Role Key");
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from("lending_pools")
    .insert({
      name: "XLM Test Pool",
      status: "active",
      total_liquidity: 0,
      available_liquidity: 0,
      apr_bps: 500,
      aqua_apr_bps: 200
    })
    .select();

  if (error) {
    console.error("Error creating pool:", error);
  } else {
    console.log("Pool created:", data);
  }
}

main().catch(console.error);

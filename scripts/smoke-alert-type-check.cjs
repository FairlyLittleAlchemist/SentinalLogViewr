// Quick smoke check to verify alert type distribution in Supabase.
// Usage: node scripts/smoke-alert-type-check.cjs

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ALERT_TYPES = ["incident", "security_event", "activity", "firewall"];

function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
}

async function main() {
  loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase credentials. Populate NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const results = [];
  for (const type of ALERT_TYPES) {
    const { count, error } = await supabase
      .from("alerts")
      .select("id", { count: "exact", head: true })
      .eq("type", type);
    if (error) throw error;

    const { data: sample, error: sampleError } = await supabase
      .from("alerts")
      .select("id,title,severity,status")
      .eq("type", type)
      .order("timestamp", { ascending: false })
      .limit(3);
    if (sampleError) throw sampleError;

    results.push({ type, count: count ?? 0, sample: sample ?? [] });
  }

  const { count: missingTypeCount, error: missingTypeError } = await supabase
    .from("alerts")
    .select("id", { count: "exact", head: true })
    .or("type.is.null,type.eq.''");
  if (missingTypeError) throw missingTypeError;

  console.log("Alert type distribution:");
  for (const result of results) {
    console.log(`  ${result.type.padEnd(15)} ${String(result.count).padStart(6)}  samples: ${result.sample.map((r) => r.id).join(", ") || "none"}`);
  }
  console.log(`Missing type: ${missingTypeCount ?? 0}`);
}

main().catch((err) => {
  console.error("Smoke check failed:", err.message || err);
  process.exit(1);
});

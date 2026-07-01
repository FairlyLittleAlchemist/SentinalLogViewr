// Sequential alert simulator for n8n webhook testing.
// Reads real alerts from Supabase, sends them one by one to a webhook,
// and persists progress in a local state file.
//
// Examples:
//   npm run simulate:alerts
//   node scripts/alert-sequencer.cjs --interval=30000
//   node scripts/alert-sequencer.cjs --require-resolution
//   node scripts/alert-sequencer.cjs --reset

const fs = require("node:fs");
const path = require("node:path");
const { createClient } = require("@supabase/supabase-js");

const ROOT_DIR = path.join(__dirname, "..");
const ENV_PATH = path.join(ROOT_DIR, ".env.local");
const DEFAULT_STATE_PATH = path.join(__dirname, "alert-sequencer.state.json");
const DEFAULT_WEBHOOK_URL = "http://127.0.0.1:5678/webhook/log-alert";
const FINAL_STATUSES = new Set(["resolved", "dismissed"]);

function loadEnv() {
  if (!fs.existsSync(ENV_PATH)) return;

  for (const line of fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) {
      process.env[key] = rawValue;
    }
  }
}

function parseArgs(argv) {
  const options = {
    intervalMs: 60_000,
    statePath: DEFAULT_STATE_PATH,
    webhookUrl: process.env.N8N_SIMULATOR_WEBHOOK_URL || DEFAULT_WEBHOOK_URL,
    requireResolution: false,
    reset: false,
    limit: 0,
    order: "asc",
    type: "all",
    severity: "all",
  };

  for (const arg of argv) {
    if (arg === "--reset") {
      options.reset = true;
      continue;
    }
    if (arg === "--require-resolution") {
      options.requireResolution = true;
      continue;
    }
    if (arg.startsWith("--interval=")) {
      options.intervalMs = Math.max(Number(arg.slice("--interval=".length)) || 0, 1_000);
      continue;
    }
    if (arg.startsWith("--state=")) {
      options.statePath = path.resolve(ROOT_DIR, arg.slice("--state=".length));
      continue;
    }
    if (arg.startsWith("--webhook=")) {
      options.webhookUrl = arg.slice("--webhook=".length).trim() || options.webhookUrl;
      continue;
    }
    if (arg.startsWith("--limit=")) {
      options.limit = Math.max(Number(arg.slice("--limit=".length)) || 0, 0);
      continue;
    }
    if (arg.startsWith("--order=")) {
      const value = arg.slice("--order=".length).trim().toLowerCase();
      options.order = value === "desc" ? "desc" : "asc";
      continue;
    }
    if (arg.startsWith("--type=")) {
      options.type = arg.slice("--type=".length).trim().toLowerCase() || "all";
      continue;
    }
    if (arg.startsWith("--severity=")) {
      options.severity = arg.slice("--severity=".length).trim().toLowerCase() || "all";
      continue;
    }
  }

  return options;
}

function loadState(statePath) {
  if (!fs.existsSync(statePath)) {
    return {
      index: 0,
      currentAlertId: null,
      deliveredCount: 0,
      lastSentAt: null,
    };
  }

  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return {
      index: 0,
      currentAlertId: null,
      deliveredCount: 0,
      lastSentAt: null,
    };
  }
}

function saveState(statePath, state) {
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function buildPayload(alert) {
  return {
    id: alert.id,
    title: alert.title,
    severity: alert.severity,
    status: alert.status,
    type: alert.type,
    source: alert.source,
    timestamp: new Date().toISOString(),
    originalTimestamp: alert.timestamp,
    description: alert.description,
    assignee: alert.assignee,
    category: alert.category,
    eventCode: alert.event_code,
    eventName: alert.event_name,
    actor: alert.actor,
    resource: alert.resource,
    ipAddress: alert.ip_address,
    summary: alert.summary,
    recommendedActions: Array.isArray(alert.recommended_actions) ? alert.recommended_actions : [],
    parsedFacts: alert.parsed_facts ?? null,
  };
}

async function loadAlerts(supabase, options) {
  let query = supabase
    .from("alerts")
    .select("id,title,severity,status,type,source,timestamp,description,assignee,category,event_code,event_name,actor,resource,ip_address,summary,recommended_actions,parsed_facts")
    .order("timestamp", { ascending: options.order === "asc" });

  if (options.type !== "all") {
    query = query.eq("type", options.type);
  }
  if (options.severity !== "all") {
    query = query.eq("severity", options.severity);
  }
  if (options.limit > 0) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function loadCurrentStatus(supabase, alertId) {
  const { data: alert, error: alertError } = await supabase
    .from("alerts")
    .select("status")
    .eq("id", alertId)
    .maybeSingle();

  if (alertError) throw alertError;
  if (!alert) return null;

  const { data: override, error: overrideError } = await supabase
    .from("alert_overrides")
    .select("status")
    .eq("alert_id", alertId)
    .maybeSingle();

  if (overrideError) throw overrideError;

  return String(override?.status ?? alert.status ?? "").trim().toLowerCase() || null;
}

async function postWebhook(webhookUrl, payload) {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Webhook error ${response.status}: ${text}`);
  }

  return text;
}

function formatError(error) {
  if (!(error instanceof Error)) {
    if (typeof error === "object" && error !== null) {
      try {
        return JSON.stringify(error, null, 2);
      } catch {
        return String(error);
      }
    }
    return String(error);
  }

  const details = [error.message];
  const cause = error.cause;

  if (cause && typeof cause === "object") {
    if ("code" in cause && cause.code) details.push(`code=${cause.code}`);
    if ("errno" in cause && cause.errno) details.push(`errno=${cause.errno}`);
    if ("syscall" in cause && cause.syscall) details.push(`syscall=${cause.syscall}`);
    if ("address" in cause && cause.address) details.push(`address=${cause.address}`);
    if ("port" in cause && cause.port) details.push(`port=${cause.port}`);
  }

  if ("response" in error && error.response && typeof error.response === "object") {
    try {
      details.push(`response=${JSON.stringify(error.response)}`);
    } catch {}
  }

  return details.join(" | ");
}

function describeAlert(alert, index, total) {
  return `[${index + 1}/${total}] ${alert.id} | ${alert.type || "unknown"} | ${alert.severity} | ${alert.title}`;
}

async function main() {
  loadEnv();
  const options = parseArgs(process.argv.slice(2));

  if (options.reset) {
    saveState(options.statePath, {
      index: 0,
      currentAlertId: null,
      deliveredCount: 0,
      lastSentAt: null,
    });
    console.log(`State reset: ${options.statePath}`);
    return;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase credentials. Populate NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.");
  }

  if (!options.webhookUrl) {
    throw new Error("Missing webhook URL. Pass --webhook=... or set N8N_SIMULATOR_WEBHOOK_URL.");
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let busy = false;

  async function tick() {
    if (busy) return;
    busy = true;

    try {
      const alerts = await loadAlerts(supabase, options);
      const state = loadState(options.statePath);

      if (!alerts.length) {
        console.log("No alerts found for the selected filters.");
        return;
      }

      if (state.index >= alerts.length) {
        console.log("All selected alerts have already been sent.");
        return;
      }

      if (options.requireResolution && state.currentAlertId) {
        const currentStatus = await loadCurrentStatus(supabase, state.currentAlertId);
        if (!currentStatus) {
          console.log(`Current alert ${state.currentAlertId} no longer exists. Moving on.`);
          state.currentAlertId = null;
          saveState(options.statePath, state);
        } else if (!FINAL_STATUSES.has(currentStatus)) {
          console.log(`Waiting for ${state.currentAlertId} to be handled. Current status: ${currentStatus}`);
          return;
        } else {
          console.log(`Current alert ${state.currentAlertId} is handled with status: ${currentStatus}`);
          state.currentAlertId = null;
          saveState(options.statePath, state);
        }
      }

      const nextAlert = alerts[state.index];
      if (!nextAlert) {
        console.log("No next alert available for the current index.");
        return;
      }

      const payload = buildPayload(nextAlert);
      await postWebhook(options.webhookUrl, payload);

      state.currentAlertId = nextAlert.id;
      state.lastSentAt = new Date().toISOString();
      state.deliveredCount = Number(state.deliveredCount || 0) + 1;
      state.index = Number(state.index || 0) + 1;
      saveState(options.statePath, state);

      console.log(`Sent ${describeAlert(nextAlert, state.index - 1, alerts.length)}`);
    } catch (error) {
      console.error("Simulator tick failed:", formatError(error));
    } finally {
      busy = false;
    }
  }

  console.log("Alert simulator started.");
  console.log(`Webhook: ${options.webhookUrl}`);
  console.log(`Interval: ${options.intervalMs}ms`);
  console.log(`Require resolution: ${options.requireResolution ? "yes" : "no"}`);
  console.log(`State file: ${options.statePath}`);
  console.log(`Filters: type=${options.type}, severity=${options.severity}, order=${options.order}, limit=${options.limit || "all"}`);

  await tick();
  setInterval(() => {
    void tick();
  }, options.intervalMs);
}

main().catch((error) => {
  console.error("Simulator failed to start:", formatError(error));
  process.exit(1);
});

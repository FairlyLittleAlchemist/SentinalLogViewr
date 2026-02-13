const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse");
const { createClient } = require("@supabase/supabase-js");
const { XMLParser } = require("fast-xml-parser");
const JSON5 = require("json5");
const logfmt = require("logfmt");
const { flatten } = require("flat");

const CSV_FILES = [
  { name: "Alert.csv", kind: "security_event" },
  { name: "Sec Event.csv", kind: "security_event" },
  { name: "AzurActivity.csv", kind: "activity" },
  { name: "FierWall.csv", kind: "firewall" },
  { name: "Incedent.csv", kind: "incident" },
];

const ALERT_STATUSES = new Set(["new", "in_progress", "resolved", "dismissed"]);
const LOG_STATUSES = new Set(["new", "investigating", "resolved", "dismissed"]);

class EtlV2Ingestor {
  constructor(supabase) {
    this.supabase = supabase;
    this.runId = null;
    this.rowsSeen = 0;
    this.rowsAccepted = 0;
    this.rowsRejected = 0;
    this.rejectionReasons = new Map();
    this.batch = [];
    this.batchSize = 250;
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      trimValues: true,
      parseTagValue: true,
      parseAttributeValue: true,
    });
  }

  addReject(reason) {
    this.rowsRejected += 1;
    this.rejectionReasons.set(reason, (this.rejectionReasons.get(reason) || 0) + 1);
  }

  async startRun() {
    const sourceManifest = CSV_FILES.map((entry) => ({ file: entry.name, kind: entry.kind }));
    const { data, error } = await this.supabase
      .from("ingest_runs")
      .insert({
        status: "running",
        source_manifest: sourceManifest,
      })
      .select("id")
      .single();

    if (error || !data?.id) {
      throw new Error(`Unable to create ingest run: ${error?.message || "unknown"}`);
    }

    this.runId = data.id;
    return this.runId;
  }

  async markRun(status, extra = {}) {
    if (!this.runId) return;
    const payload = {
      status,
      rows_seen: this.rowsSeen,
      rows_loaded: this.rowsAccepted,
      rows_rejected: this.rowsRejected,
      ...extra,
    };
    const { error } = await this.supabase.from("ingest_runs").update(payload).eq("id", this.runId);
    if (error) {
      throw new Error(`Unable to update ingest run status: ${error.message}`);
    }
  }

  async flushBatch() {
    if (!this.batch.length) return;

    const payload = this.batch;
    this.batch = [];

    let lastError = null;
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const { error } = await this.supabase
        .from("stg_events")
        .upsert(payload, {
          onConflict: "ingest_run_id,event_uid",
          ignoreDuplicates: true,
        });

      if (!error) {
        lastError = null;
        break;
      }

      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }

    if (lastError) {
      throw new Error(`Failed to write staging batch: ${lastError.message}`);
    }

    this.rowsAccepted += payload.length;
  }

  normalizeRow(row) {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      const cleanKey = String(key || "").replace(/^\uFEFF/, "").trim().toLowerCase();
      normalized[cleanKey] = value;
    }
    return normalized;
  }

  getField(row, keys) {
    for (const key of keys) {
      const value = row[String(key).toLowerCase()];
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        return String(value).trim();
      }
    }
    return "";
  }

  parseDate(value) {
    if (!value) return null;
    const normalized = String(value).replace(/,/g, "").trim();
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  parseDateFromRow(row, kind) {
    const byKind = {
      incident: [
        "timegenerated [utc]",
        "createdtime [utc]",
        "firstactivitytime [utc]",
        "lastactivitytime [utc]",
        "closedtime [utc]",
      ],
      activity: [
        "timegenerated [utc]",
        "eventsubmissiontimestamp [utc]",
      ],
      firewall: [
        "timegenerated [utc]",
        "starttime [utc]",
        "endtime [utc]",
        "receipttime",
      ],
      security_event: [
        "timegenerated [utc]",
        "eventsubmissiontimestamp [utc]",
        "timecollected [utc]",
      ],
    };

    const fields = byKind[kind] || byKind.security_event;
    for (const field of fields) {
      const parsed = this.parseDate(this.getField(row, [field]));
      if (parsed) return parsed;
    }

    return null;
  }

  normalizeSeverity(raw, kind) {
    const value = String(raw || "").toLowerCase().trim();
    const numeric = Number(value);

    if (!Number.isNaN(numeric)) {
      if (kind === "incident") {
        if (numeric >= 3) return "critical";
        if (numeric >= 2) return "high";
        if (numeric >= 1) return "medium";
        return "low";
      }
      if (kind === "security_event") {
        // Windows event levels are not linear risk scores.
        // Common exports include 0/4/8 for informational classes.
        if (numeric === 1) return "critical";
        if (numeric === 2) return "high";
        if (numeric === 3) return "medium";
        if (numeric === 0 || numeric === 4 || numeric === 8) return "low";
        return "medium";
      }
      if (kind === "firewall") {
        if (numeric >= 8) return "high";
        if (numeric >= 5) return "medium";
        if (numeric >= 3) return "medium";
        return "low";
      }
      if (kind === "activity") {
        if (numeric >= 8) return "high";
        if (numeric >= 5) return "medium";
        if (numeric >= 3) return "medium";
        return "informational";
      }
      if (numeric >= 8) return "high";
      if (numeric >= 5) return "medium";
      if (numeric >= 3) return "medium";
      return "low";
    }

    const map = {
      incident: [
        ["critical", "critical"],
        ["high", "high"],
        ["medium", "medium"],
        ["low", "low"],
        ["informational", "low"],
        ["info", "low"],
      ],
      activity: [
        ["critical", "critical"],
        ["error", "high"],
        ["failed", "high"],
        ["warning", "medium"],
        ["warn", "medium"],
        ["information", "informational"],
        ["success", "informational"],
      ],
      firewall: [
        ["critical", "critical"],
        ["high", "high"],
        ["notice", "medium"],
        ["warning", "medium"],
        ["info", "informational"],
        ["informational", "informational"],
      ],
      security_event: [
        ["critical", "critical"],
        ["error", "high"],
        ["high", "high"],
        ["warning", "medium"],
        ["warn", "medium"],
        ["informational", "informational"],
        ["success", "informational"],
      ],
    };

    const mappings = map[kind] || map.security_event;
    for (const [needle, out] of mappings) {
      if (value.includes(needle)) {
        return out;
      }
    }

    return "low";
  }

  normalizeStatus(raw, kind) {
    const value = String(raw || "").toLowerCase();
    if (value.includes("resolved") || value.includes("closed") || value.includes("complete") || value.includes("success")) {
      return "resolved";
    }
    if (value.includes("dismiss") || value.includes("false")) {
      return "dismissed";
    }
    if (value.includes("progress") || value.includes("active") || value.includes("investigat")) {
      return kind === "incident" ? "in_progress" : "investigating";
    }
    return "new";
  }

  safeJsonParse(value) {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      try {
        return JSON5.parse(trimmed);
      } catch {
        return null;
      }
    }
  }

  parseDelimitedKeyValues(value) {
    if (!value || typeof value !== "string" || !value.includes("=")) return null;
    try {
      const parsed = logfmt.parse(String(value).replace(/;/g, "\n"));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      const entries = Object.entries(parsed).filter(([, v]) => String(v || "").trim() !== "");
      if (entries.length < 2) return null;
      const normalized = {};
      for (const [k, v] of entries) {
        normalized[String(k)] = String(v);
      }
      return normalized;
    } catch {
      return null;
    }
  }

  parseXmlPayload(xml) {
    if (!xml || !xml.includes("<") || !xml.includes(">")) return null;
    try {
      const parsed = this.xmlParser.parse(String(xml).trim());
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  normalizePayloadObject(payload) {
    if (!payload || typeof payload !== "object") return payload;
    if (Array.isArray(payload)) {
      return payload.map((item) => this.normalizePayloadObject(item));
    }

    const normalized = {};
    for (const [key, value] of Object.entries(payload)) {
      const cleanKey = String(key || "").trim();
      if (!cleanKey) continue;

      if (typeof value === "string") {
        const trimmed = value.trim();
        const nestedJson = this.safeJsonParse(trimmed);
        if (nestedJson && typeof nestedJson === "object") {
          normalized[cleanKey] = this.normalizePayloadObject(nestedJson);
          continue;
        }

        const delimited = this.parseDelimitedKeyValues(trimmed);
        if (delimited) {
          normalized[cleanKey] = this.normalizePayloadObject(delimited);
          continue;
        }
      }

      if (value && typeof value === "object") {
        normalized[cleanKey] = this.normalizePayloadObject(value);
      } else {
        normalized[cleanKey] = value;
      }
    }

    return normalized;
  }

  flattenPayload(payload) {
    if (!payload || typeof payload !== "object") return {};
    return flatten(payload, { safe: true, delimiter: "." });
  }

  extractFromPayload(payload, keys) {
    if (!payload || typeof payload !== "object") return "";
    const flat = this.flattenPayload(payload);
    for (const key of keys) {
      const lower = String(key).toLowerCase();
      for (const [entryKey, entryValue] of Object.entries(flat)) {
        if (String(entryKey).toLowerCase().endsWith(lower) && entryValue !== null && entryValue !== undefined) {
          const text = String(entryValue).trim();
          if (text) return text;
        }
      }
    }
    return "";
  }

  buildParsedFacts({ kind, row, payloadJson, title, description, status, severity, source, provider, category, eventCode, eventName, actor, resource, ipAddress }) {
    const additionalData = this.safeJsonParse(this.getField(row, ["additionaldata"])) || {};
    const tactics = Array.isArray(additionalData.tactics) ? additionalData.tactics.filter(Boolean).slice(0, 10) : [];
    const alertCount = additionalData.alertsCount ?? "";
    const relatedRuleIds = this.safeJsonParse(this.getField(row, ["relatedanalyticruleids"]));
    const ruleIds = Array.isArray(relatedRuleIds)
      ? relatedRuleIds.map((v) => String(v)).slice(0, 10)
      : [];

    return {
      kind,
      title: title || eventName || "Event",
      summary: description || "No description provided.",
      status: status || "new",
      severity,
      source,
      provider: provider || source || "Unknown",
      category: category || "Unknown",
      eventCode: eventCode || "",
      eventName: eventName || "",
      actor: actor || "",
      resource: resource || "",
      ip: ipAddress || "",
      incidentId: this.getField(row, ["incidentnumber", "providerincidentid", "correlationid", "incidentname"]) || "",
      classification: this.getField(row, ["classification", "classificationreason"]) || "",
      owner: this.getField(row, ["owner", "assignedto"]) || "",
      alertCount: alertCount !== "" ? String(alertCount) : "",
      tactics,
      ruleIds,
      hasPayloadJson: !!payloadJson,
    };
  }

  extractPayload(row) {
    const payloadRaw = this.getField(row, [
      "eventdata",
      "properties",
      "httprequest",
      "additionalextensions",
      "additionaldata",
      "description",
      "message",
      "comments",
    ]);

    const payloadJson = this.normalizePayloadObject(
      this.safeJsonParse(payloadRaw) || this.parseXmlPayload(payloadRaw) || this.parseDelimitedKeyValues(payloadRaw)
    );

    return { payloadRaw, payloadJson };
  }

  summaryFromPayload(payloadRaw, payloadJson, fallback = "") {
    if (payloadJson && typeof payloadJson === "object") {
      const directMessage = this.extractFromPayload(payloadJson, [
        "message",
        "Activity",
        "DeviceAction",
        "FTNTFGTaction",
        "RequestURL",
        "Reason",
        "description",
        "eventCategory",
        "statusCode",
      ]);

      if (directMessage && String(directMessage).trim()) {
        const clean = String(directMessage).replace(/\s+/g, " ").trim();
        if (clean) return clean.slice(0, 220);
      }
    }

    if (payloadRaw) {
      return String(payloadRaw).replace(/\s+/g, " ").slice(0, 220);
    }

    return fallback || "No description provided.";
  }

  parseIncidentOwner(rawOwner) {
    const parsed = this.safeJsonParse(rawOwner);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { assignee: "", actor: "" };
    }

    const record = parsed;
    const assignee = String(
      record.assignedTo ||
      record.userPrincipalName ||
      record.email ||
      record.objectId ||
      ""
    ).trim();

    const actor = String(
      record.userPrincipalName ||
      record.email ||
      record.assignedTo ||
      record.objectId ||
      ""
    ).trim();

    return { assignee, actor };
  }

  formatProviderLabel(provider) {
    const raw = String(provider || "").trim();
    if (!raw) return "";
    if (!raw.includes(".") && /[a-z]/.test(raw)) {
      return raw;
    }

    const tokens = raw.replace(/^MICROSOFT\./i, "").split(".");
    const label = tokens[tokens.length - 1] || raw;
    const cleaned = String(label)
      .toLowerCase()
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
  }

  formatOperationTitle(value) {
    const raw = String(value || "").trim();
    if (!raw) return "Event";

    const token = raw.includes("/") ? raw.split("/").filter(Boolean).at(-1) || raw : raw;
    return String(token)
      .replace(/listkeys/gi, "list keys")
      .replace(/listcluster/gi, "list cluster")
      .replace(/clusteruser/gi, "cluster user")
      .replace(/usercredential/gi, "user credential")
      .replace(/admincredential/gi, "admin credential")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  stableHash(parts) {
    return crypto.createHash("sha256").update(parts.join("|")).digest("hex");
  }

  buildEventUid(row, fileName, kind, occurredAt, eventName, resource, actor, summary) {
    const stable = this.getField(row, ["eventdataid", "incidentnumber", "correlationid"]);
    if (stable) {
      return `${kind}-${String(stable).toLowerCase()}`;
    }

    const digest = this.stableHash([
      fileName,
      occurredAt.toISOString(),
      eventName || "",
      resource || "",
      actor || "",
      summary || "",
    ]);
    return `${kind}-${digest}`;
  }

  toArrayValue(...values) {
    const set = new Set();
    values.forEach((value) => {
      const normalized = String(value || "").trim();
      if (normalized) set.add(normalized);
    });
    return set.size ? Array.from(set).slice(0, 6) : ["Unknown"];
  }

  buildStagingRecord(row, kind, fileName, rowNumber) {
    const occurredAt = this.parseDateFromRow(row, kind);
    if (!occurredAt) {
      this.addReject("missing_timestamp");
      return null;
    }

    const severity = this.normalizeSeverity(
      this.getField(row, ["severity", "logseverity", "level", "eventlevelname", "activitystatusvalue", "threatseverity"]),
      kind
    );

    const status = this.normalizeStatus(this.getField(row, ["status", "activitystatusvalue", "eventoutcome"]), kind);
    const { payloadRaw, payloadJson } = this.extractPayload(row);

    const eventCode = this.getField(row, ["eventid", "incidentnumber", "eventdataid", "correlationid", "operationid"]);
    const eventName = this.getField(row, ["operationnamevalue", "title", "activity", "incidentname", "eventsourcename", "operationname"]);
    const source = this.getField(row, ["sourcesystem", "providername", "categoryvalue", "category", "resourceprovidervalue", "devicevendor"]) || fileName;
    const provider = this.getField(row, ["resourceprovidervalue", "providername", "eventsourcename", "sourcesystem", "deviceproduct", "resourceprovider"]) || source;
    const providerLabel = this.formatProviderLabel(provider);
    const category = this.getField(row, ["categoryvalue", "category", "channel", "task", "eventcategory", "deviceeventcategory", "type"]) || "Unknown";

    const incidentOwnerRaw = kind === "incident" ? this.getField(row, ["owner"]) : "";
    const incidentOwner = this.parseIncidentOwner(incidentOwnerRaw);

    const actor = this.getField(row, ["caller", "account", "accountname", "subjectusername", "sourceusername", "destinationusername"])
      || incidentOwner.actor
      || this.extractFromPayload(payloadJson, ["caller", "account", "targetUser", "subjectUserName", "SourceUserName", "DestinationUserName"]);

    const resource = this.getField(row, ["resource", "resourceid", "entity", "computer", "workstation", "destinationhostname", "devicename"])
      || this.extractFromPayload(payloadJson, ["resource", "entity", "resourceId", "fullFilePath", "filePath", "DestinationHostName", "SourceHostName"]);

    const ipAddress = this.getField(row, ["calleripaddress", "ipaddress", "remoteipaddress", "clientipaddress", "clientaddress", "sourceip", "destinationip", "remoteip", "maliciousip"])
      || this.extractFromPayload(payloadJson, ["callerIpAddress", "ipAddress", "remoteIpAddress", "SourceIP", "DestinationIP", "clientIpAddress"]);

    const title = this.formatOperationTitle(
      this.extractFromPayload(payloadJson, ["message", "action", "operationNameValue"]) ||
      eventName ||
      this.getField(row, ["title", "activity", "operationnamevalue"]) ||
      "Event"
    );

    const description = this.summaryFromPayload(payloadRaw, payloadJson, this.getField(row, ["description", "activity", "title", "message"]));

    const eventUid = this.buildEventUid(row, fileName, kind, occurredAt, eventName, resource, actor, description);
    const rowHash = this.stableHash([JSON.stringify(row)]);

    const normalizedStatus = ALERT_STATUSES.has(status)
      ? status
      : LOG_STATUSES.has(status)
        ? status
        : "new";

    const isIncident = kind === "incident";
    const isHighRisk = severity === "critical" || severity === "high";

    const parsedFacts = this.buildParsedFacts({
      kind,
      row,
      payloadJson,
      title,
      description,
      status: normalizedStatus,
      severity,
      source: providerLabel || source,
      provider,
      category,
      eventCode,
      eventName,
      actor,
      resource,
      ipAddress,
    });

    return {
      ingest_run_id: this.runId,
      event_uid: eventUid,
      source_file: fileName,
      source_kind: kind,
      source_row_number: rowNumber,
      occurred_at: occurredAt.toISOString(),
      severity,
      status: normalizedStatus,
      source: providerLabel || source,
      provider,
      category,
      event_code: eventCode || null,
      event_name: eventName || null,
      actor: actor || null,
      resource: resource || null,
      ip_address: ipAddress || null,
      payload_raw: payloadRaw || null,
      payload_json: payloadJson || null,
      parsed_facts: parsedFacts,
      summary: description,
      raw_row: row,
      row_hash: rowHash,
      title,
      description,
      assignee: isIncident ? (incidentOwner.assignee || this.getField(row, ["assignedto"]) || null) : null,
      tactics: this.toArrayValue(category, kind),
      affected_entities: this.toArrayValue(resource, actor),
      recommended_actions: ["Review event context", "Validate source and actor", "Document triage outcome"],
      is_alert_candidate: isIncident || isHighRisk,
    };
  }

  async ingestFile(filePath, kind, fileName) {
    const parser = fs.createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        trim: true,
      })
    );

    let rowNumber = 1;
    for await (const rawRow of parser) {
      this.rowsSeen += 1;
      const row = this.normalizeRow(rawRow);
      const record = this.buildStagingRecord(row, kind, fileName, rowNumber);
      rowNumber += 1;

      if (!record) {
        continue;
      }

      this.batch.push(record);
      if (this.batch.length >= this.batchSize) {
        await this.flushBatch();
      }
    }
  }

  async ingestFiles() {
    for (const entry of CSV_FILES) {
      const filePath = path.join(__dirname, "..", entry.name);
      if (!fs.existsSync(filePath)) {
        this.addReject(`missing_file:${entry.name}`);
        continue;
      }
      await this.ingestFile(filePath, entry.kind, entry.name);
      await this.flushBatch();
    }
  }

  rejectionSummary() {
    if (!this.rejectionReasons.size) return null;
    return Array.from(this.rejectionReasons.entries())
      .map(([reason, count]) => `${reason}:${count}`)
      .join(", ");
  }

  async rpcWithRetry(fn, params = {}, attempts = 3) {
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const { error } = await this.supabase.rpc(fn, params);
      if (!error) {
        return;
      }
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
    throw new Error(`${fn} RPC failed: ${lastError?.message || "unknown error"}`);
  }

  isMissingFunctionError(error) {
    const text = String(error?.message || "").toLowerCase();
    return text.includes("could not find the function") || text.includes("no function matches");
  }

  async finalizeChunked() {
    const params = { p_run_id: this.runId };
    const steps = [
      "ingest_start_publish",
      "ingest_publish_logs",
      "ingest_publish_alerts",
      "ingest_publish_rollups",
      "ingest_finish_publish",
    ];

    for (const step of steps) {
      const { error } = await this.supabase.rpc(step, params);
      if (!error) {
        continue;
      }

      if (this.isMissingFunctionError(error)) {
        throw error;
      }

      // Retry transient failures (timeouts/network) once per step using shared helper.
      await this.rpcWithRetry(step, params, 2);
    }
  }

  async finalize() {
    if (!this.runId) {
      throw new Error("No ingest run initialized");
    }

    await this.markRun("loaded", {
      error_summary: this.rejectionSummary(),
    });

    try {
      await this.finalizeChunked();
      return;
    } catch (error) {
      if (!this.isMissingFunctionError(error)) {
        throw error;
      }
    }

    const { error } = await this.supabase.rpc("finalize_ingest_run", { p_run_id: this.runId });
    if (error) {
      throw new Error(`finalize_ingest_run RPC failed: ${error.message}`);
    }
  }

  async run() {
    await this.startRun();
    await this.ingestFiles();
    await this.flushBatch();
    await this.finalize();
  }
}

async function loadEnv() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (match && !process.env[match[1]]) {
        process.env[match[1]] = match[2];
      }
    });
}

async function main() {
  await loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase URL or service role key missing.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ingestor = new EtlV2Ingestor(supabase);

  try {
    await ingestor.run();
    console.log(`ETL v2 completed. runId=${ingestor.runId} rowsSeen=${ingestor.rowsSeen} rowsLoaded=${ingestor.rowsAccepted} rowsRejected=${ingestor.rowsRejected}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingest error";
    if (ingestor.runId) {
      try {
        await ingestor.markRun("failed", {
          finished_at: new Date().toISOString(),
          error_summary: [ingestor.rejectionSummary(), message].filter(Boolean).join(" | "),
        });
      } catch {
        // best effort run failure update
      }
    }
    throw error;
  }
}

main().catch((error) => {
  console.error("ETL v2 importer failed:", error);
  process.exit(1);
});

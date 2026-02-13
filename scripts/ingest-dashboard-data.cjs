const fs = require("node:fs");
const path = require("node:path");
const { parse } = require("csv-parse");
const { createClient } = require("@supabase/supabase-js");
const { XMLParser } = require("fast-xml-parser");

const CSV_FILES = [
  { name: "Alert.csv", type: "alert" },
  { name: "Sec Event.csv", type: "log" },
  { name: "AzurActivity.csv", type: "alert" },
  { name: "FierWall.csv", type: "log" },
  { name: "Incedent.csv", type: "alert" },
];

class DashboardIngestor {
  constructor() {
    this.totalAlerts = 0;
    this.severityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    this.activeInvestigations = 0;
    this.attackCounts = new Map();
    this.timeBuckets = new Map();
    this.last24HoursCount = 0;
    this.responseSumMs = 0;
    this.responseCount = 0;
    this.alertRecords = [];
    this.logRecords = [];
    this.logSequence = 0;
    this.alertSequence = 0;
    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@",
      trimValues: true,
      parseTagValue: true,
      parseAttributeValue: true,
    });
  }

  async insertInBatches(supabase, table, records, batchSize = 200) {
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      if (!batch.length) continue;
      let lastError = null;
      for (let attempt = 1; attempt <= 4; attempt += 1) {
        const { error } = await supabase.from(table).insert(batch);
        if (!error) {
          lastError = null;
          break;
        }
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, attempt * 250));
      }
      if (lastError) {
        throw new Error(`Failed to insert into ${table}: ${lastError.message}`);
      }
    }
  }

  normalizeRow(row) {
    const normalized = {};
    for (const [key, value] of Object.entries(row)) {
      const cleanKey = key.replace(/^\uFEFF/, "").trim().toLowerCase();
      normalized[cleanKey] = value;
    }
    return normalized;
  }

  getField(row, keys) {
    for (const key of keys) {
      const value = row[key.toLowerCase()];
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

  normalizeSeverity(raw, mode = "alert") {
    const value = String(raw || "").toLowerCase();
    let mapped = "low";

    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      if (numeric >= 8) mapped = "critical";
      else if (numeric >= 5) mapped = "high";
      else if (numeric >= 3) mapped = "medium";
      else mapped = "low";
    } else if (value.includes("critical")) {
      mapped = "critical";
    } else if (value.includes("error") || value.includes("high") || value.includes("severe")) {
      mapped = "high";
    } else if (value.includes("warn") || value.includes("medium")) {
      mapped = "medium";
    } else if (value.includes("informational") || value.includes("info") || value.includes("success")) {
      mapped = "informational";
    }

    if (mode === "alert" && mapped === "informational") {
      return "low";
    }

    return mapped;
  }

  normalizeAlertStatus(raw) {
    const value = String(raw || "").toLowerCase();
    if (value.includes("resolved") || value.includes("closed")) return "resolved";
    if (value.includes("dismiss") || value.includes("false")) return "dismissed";
    if (value.includes("progress") || value.includes("active") || value.includes("investigat")) return "in_progress";
    return "new";
  }

  normalizeLogStatus(raw) {
    const value = String(raw || "").toLowerCase();
    if (value.includes("resolved") || value.includes("closed") || value.includes("success")) return "resolved";
    if (value.includes("dismiss")) return "dismissed";
    if (value.includes("progress") || value.includes("active") || value.includes("investigat")) return "investigating";
    return "new";
  }

  safeJsonParse(value) {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!(trimmed.startsWith("{") || trimmed.startsWith("["))) return null;
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  parseDelimitedKeyValues(value) {
    if (!value || typeof value !== "string" || !value.includes("=")) return null;
    const result = {};
    let matches = 0;
    const chunks = value.split(";");
    for (const chunk of chunks) {
      const trimmed = String(chunk || "").trim();
      if (!trimmed || !trimmed.includes("=")) continue;
      const [rawKey, ...rawValue] = trimmed.split("=");
      const key = String(rawKey || "").trim();
      const parsedValue = rawValue.join("=").trim();
      if (!key || !parsedValue) continue;
      result[key] = parsedValue;
      matches += 1;
    }
    return matches >= 2 && Object.keys(result).length ? result : null;
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

  flattenPayload(payload, prefix = "", out = {}) {
    if (payload === null || payload === undefined) return out;
    if (typeof payload !== "object") {
      if (prefix) out[prefix] = payload;
      return out;
    }
    if (Array.isArray(payload)) {
      payload.forEach((item, idx) => {
        this.flattenPayload(item, `${prefix}[${idx + 1}]`, out);
      });
      return out;
    }

    for (const [key, value] of Object.entries(payload)) {
      const next = prefix ? `${prefix}.${key}` : key;
      this.flattenPayload(value, next, out);
    }
    return out;
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
        let clean = String(directMessage).replace(/\s+/g, " ").trim();
        if (clean.includes("/")) {
          clean = this.formatOperationTitle(clean);
        }
        if (clean) return clean.slice(0, 220);
      }
    }

    if (payloadJson && typeof payloadJson === "object") {
      const pairs = Object.entries(this.flattenPayload(payloadJson))
        .filter(([, v]) => typeof v !== "object" && v !== null && v !== undefined && String(v).trim() !== "")
        .slice(0, 3)
        .map(([k, v]) => `${k}: ${String(v).replace(/\s+/g, " ").slice(0, 64)}`);
      if (pairs.length) return pairs.join(" | ");
    }

    if (payloadRaw) {
      return payloadRaw.replace(/\s+/g, " ").slice(0, 220);
    }

    return fallback || "No description provided.";
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
    if (!raw.includes("/")) {
      return this.humanizeOperationToken(raw);
    }

    const segments = raw.split("/").filter(Boolean);
    const actionPart = segments[segments.length - 1] || "";
    const targetPart = segments[segments.length - 2] || segments[segments.length - 1] || "";
    const action = this.humanizeOperationToken(actionPart.replace(/action$/i, ""));
    const target = this.humanizeOperationToken(targetPart);
    if (!action && !target) return raw;
    if (!action) return target;
    if (!target) return action;
    return `${action} (${target})`;
  }

  humanizeOperationToken(token) {
    let value = String(token || "")
      .replace(/listkeys/gi, "list keys")
      .replace(/listcluster/gi, "list cluster")
      .replace(/clusteruser/gi, "cluster user")
      .replace(/usercredential/gi, "user credential")
      .replace(/admincredential/gi, "admin credential")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim();

    if (value && !value.includes(" ")) {
      const dictionary = [
        "credential",
        "credentials",
        "cluster",
        "managed",
        "admin",
        "user",
        "resource",
        "group",
        "list",
        "keys",
        "host",
        "site",
      ];
      let lowered = value.toLowerCase();
      dictionary.forEach((word) => {
        lowered = lowered.replace(new RegExp(word, "g"), ` ${word} `);
      });
      value = lowered.replace(/\s+/g, " ").trim();
    }

    return value
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  detectSchema(row) {
    if (row["operationnamevalue"]) return "azure_activity";
    if (row["incidentname"] || row["providename"]) return "incident";
    if (row["eventid"] || row["activity"] || row["eventsourcename"]) return "security_event";
    return "generic";
  }

  computeResponseTimeMs(row) {
    const generated = this.parseDate(this.getField(row, ["timegenerated [utc]", "timegenerated"]));
    const collected = this.parseDate(this.getField(row, ["timecollected [utc]", "timecollected"]));
    if (!generated || !collected) return null;
    return Math.max(collected.getTime() - generated.getTime(), 0);
  }

  addTimeBucket(date, severity) {
    const hourKey = `${date.toISOString().slice(0, 13)}:00:00Z`;
    const normalized = ["critical", "high", "medium", "low"].includes(severity) ? severity : "low";
    const bucket = this.timeBuckets.get(hourKey) || { critical: 0, high: 0, medium: 0, low: 0 };
    bucket[normalized] += 1;
    this.timeBuckets.set(hourKey, bucket);
  }

  trackLast24(date) {
    if (Date.now() - date.getTime() <= 24 * 60 * 60 * 1000) {
      this.last24HoursCount += 1;
    }
  }

  toArrayValue(...values) {
    const set = new Set();
    values.forEach((value) => {
      const normalized = String(value || "").trim();
      if (normalized) set.add(normalized);
    });
    return set.size ? Array.from(set).slice(0, 5) : ["Unknown"];
  }

  buildAlertRecord(row, fileName) {
    const schema = this.detectSchema(row);
    const timestamp = this.parseDate(this.getField(row, [
      "timegenerated [utc]",
      "eventsubmissiontimestamp [utc]",
      "createdtime [utc]",
      "timegenerated",
    ])) || new Date();

    const severity = this.normalizeSeverity(
      this.getField(row, ["severity", "level", "eventlevelname", "activitystatusvalue"]),
      "alert"
    );

    const status = this.normalizeAlertStatus(this.getField(row, ["status", "activitystatusvalue"]));

    const { payloadRaw, payloadJson } = this.extractPayload(row);

    const eventCode = this.getField(row, ["eventid", "incidentnumber", "eventdataid", "correlationid", "operationid"]);
    const rawEventName = this.getField(row, ["operationnamevalue", "title", "activity", "incidentname", "eventsourcename"]);
    const eventName = rawEventName;
    const source = this.getField(row, ["sourcesystem", "providername", "categoryvalue", "category", "resourceprovidervalue"]) || "CSV";
    const provider = this.getField(row, ["resourceprovidervalue", "providername", "eventsourcename", "sourcesystem"]) || source;
    const providerLabel = this.formatProviderLabel(provider);
    const category = this.getField(row, ["categoryvalue", "category", "channel", "task", "eventcategory"]) || "Unknown";
    const actor = this.getField(row, ["caller", "account", "accountname", "owner", "subjectusername"])
      || this.extractFromPayload(payloadJson, ["caller", "account", "targetUser", "subjectUserName", "SourceUserName", "DestinationUserName"]);
    const resource = this.getField(row, ["resource", "resourceid", "entity", "computer", "workstation"])
      || this.extractFromPayload(payloadJson, ["resource", "entity", "resourceId", "fullFilePath", "filePath", "DestinationHostName", "SourceHostName"]);
    const ipAddress = this.getField(row, ["calleripaddress", "ipaddress", "remoteipaddress", "clientipaddress", "clientaddress"])
      || this.extractFromPayload(payloadJson, ["callerIpAddress", "ipAddress", "remoteIpAddress", "SourceIP", "DestinationIP", "clientIpAddress"]);

    const title = this.formatOperationTitle(
      this.extractFromPayload(payloadJson, ["message", "action", "operationNameValue"]) ||
      eventName ||
      this.getField(row, ["title", "activity", "operationnamevalue"]) ||
      "Event"
    );
    const description = this.summaryFromPayload(payloadRaw, payloadJson, this.getField(row, ["description", "activity", "title"]));

    this.alertSequence += 1;
    const idSeed = eventCode || eventName || schema || "alert";
    const safeSeed = String(idSeed).replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 64) || "alert";

    return {
      id: `csv-${this.alertSequence}-${safeSeed}`,
      title,
      severity,
      status,
      source: providerLabel || source,
      timestamp: timestamp.toISOString(),
      description,
      assignee: actor || null,
      tactics: this.toArrayValue(
        this.getField(row, ["categoryvalue", "eventcategory", "activity", "operationnamevalue"]) || category,
        schema
      ),
      affected_entities: this.toArrayValue(resource, actor),
      recommended_actions: ["Review event context", "Validate source and actor", "Document triage outcome"],
      provider,
      category,
      event_code: eventCode || null,
      event_name: eventName || null,
      actor: actor || null,
      resource: resource || null,
      ip_address: ipAddress || null,
      payload_raw: payloadRaw || null,
      payload_json: payloadJson || null,
      source_file: fileName,
    };
  }

  buildLogRecord(row, fileName) {
    const timestamp = this.parseDate(this.getField(row, [
      "timegenerated [utc]",
      "eventsubmissiontimestamp [utc]",
      "createdtime [utc]",
      "timegenerated",
      "time collected [utc]",
    ])) || new Date();

    const severity = this.normalizeSeverity(
      this.getField(row, ["severity", "level", "eventlevelname", "activitystatusvalue"]),
      "log"
    );

    const status = this.normalizeLogStatus(this.getField(row, ["status", "activitystatusvalue"]));
    const { payloadRaw, payloadJson } = this.extractPayload(row);

    const eventCode = this.getField(row, ["eventid", "eventdataid", "correlationid", "operationid"]);
    const rawEventName = this.getField(row, ["operationnamevalue", "activity", "title", "incidentname", "eventsourcename"]);
    const eventName = rawEventName;
    const source = this.getField(row, ["eventsourcename", "category", "sourcesystem", "resourceprovidervalue"]) || "Log CSV";
    const provider = this.getField(row, ["resourceprovidervalue", "providername", "eventsourcename", "sourcesystem"]) || source;
    const providerLabel = this.formatProviderLabel(provider);
    const category = this.getField(row, ["categoryvalue", "channel", "category", "subcategoryid", "task"]) || "Unknown";
    const actor = this.getField(row, ["caller", "account", "accountname", "subjectusername", "sourceusername", "destinationusername"])
      || this.extractFromPayload(payloadJson, ["caller", "account", "targetUser", "subjectUserName", "SourceUserName", "DestinationUserName"]);
    const resource = this.getField(row, ["resource", "resourceid", "entity", "computer", "workstation"])
      || this.extractFromPayload(payloadJson, ["resource", "entity", "resourceId", "fullFilePath", "filePath", "DestinationHostName", "SourceHostName"]);
    const ipAddress = this.getField(row, ["calleripaddress", "ipaddress", "remoteipaddress", "clientipaddress", "clientaddress", "sourceip", "destinationip", "remoteip"])
      || this.extractFromPayload(payloadJson, ["callerIpAddress", "ipAddress", "remoteIpAddress", "SourceIP", "DestinationIP", "clientIpAddress"]);

    const message = this.summaryFromPayload(
      payloadRaw,
      payloadJson,
      this.getField(row, ["message", "description", "activity", "operationnamevalue", "title"]) ||
        this.formatOperationTitle(eventName)
    );

    this.logSequence += 1;
    const idSeed = eventCode || eventName || "log";
    const safeSeed = String(idSeed).replace(/[^a-zA-Z0-9_\-]/g, "_").slice(0, 48) || "log";

    return {
      id: `csv-log-${this.logSequence}-${safeSeed}`,
      timestamp: timestamp.toISOString(),
      severity,
      source: providerLabel || source,
      category,
      message,
      ip_address: ipAddress || "Unknown",
      user: actor || "Unknown",
      status,
      provider,
      event_code: eventCode || null,
      event_name: eventName || null,
      actor: actor || null,
      resource: resource || null,
      payload_raw: payloadRaw || null,
      payload_json: payloadJson || null,
      source_file: fileName,
    };
  }

  processAlertMetrics(alertRecord) {
    this.totalAlerts += 1;
    this.severityCounts[alertRecord.severity] += 1;
    if (alertRecord.status === "in_progress") {
      this.activeInvestigations += 1;
    }

    const ts = new Date(alertRecord.timestamp);
    this.addTimeBucket(ts, alertRecord.severity);
    this.trackLast24(ts);

    const attackKey = alertRecord.ip_address || alertRecord.resource || alertRecord.source || "unknown";
    this.attackCounts.set(attackKey, (this.attackCounts.get(attackKey) || 0) + 1);
  }

  async ingestFiles() {
    for (const entry of CSV_FILES) {
      const filePath = path.join(__dirname, "..", entry.name);
      if (!fs.existsSync(filePath)) {
        console.warn(`Skipping missing file: ${entry.name}`);
        continue;
      }
      await this.ingestFile(filePath, entry.type, entry.name);
    }
  }

  ingestFile(filePath, type, fileName) {
    return new Promise((resolve, reject) => {
      const parser = parse({
        columns: true,
        skip_empty_lines: true,
        relax_quotes: true,
        trim: true,
      });

      parser.on("data", (rawRow) => {
        const row = this.normalizeRow(rawRow);

        if (type === "alert") {
          const alertRecord = this.buildAlertRecord(row, fileName);
          this.alertRecords.push(alertRecord);
          this.processAlertMetrics(alertRecord);

          const responseMs = this.computeResponseTimeMs(row);
          if (responseMs !== null) {
            this.responseCount += 1;
            this.responseSumMs += responseMs;
          }
          return;
        }

        const logRecord = this.buildLogRecord(row, fileName);
        this.logRecords.push(logRecord);
      });

      parser.on("end", () => resolve());
      parser.on("error", reject);

      fs.createReadStream(filePath).pipe(parser);
    });
  }

  async persist(supabase) {
    await this.upsertThreatMetrics(supabase);
    await this.upsertSeries(supabase);
    await this.upsertSeverity(supabase);
    await this.upsertAttackSources(supabase);
    await this.upsertAlerts(supabase);
    await this.upsertLogs(supabase);
  }

  async upsertThreatMetrics(supabase) {
    const total = this.totalAlerts;
    const critical = this.severityCounts.critical;
    const recently = this.last24HoursCount;
    const earlier = Math.max(total - recently, 0);
    const changePercent = earlier
      ? ((recently - earlier) / earlier) * 100
      : recently
      ? 100
      : 0;
    const meanResponse = this.responseCount > 0 ? this.responseSumMs / this.responseCount / 60000 : 0;

    const metrics = [
      {
        label: "Total Alerts",
        value: total,
        change: Number(changePercent.toFixed(1)),
        change_type: changePercent >= 0 ? "increase" : "decrease",
      },
      {
        label: "Critical Incidents",
        value: critical,
        change: 0,
        change_type: "increase",
      },
      {
        label: "Active Investigations",
        value: this.activeInvestigations,
        change: 0,
        change_type: "decrease",
      },
      {
        label: "Mean Response Time",
        value: Number(meanResponse.toFixed(1)),
        change: Math.abs(changePercent),
        change_type: changePercent >= 0 ? "increase" : "decrease",
      },
    ];

    await supabase.from("threat_metrics").upsert(metrics, { onConflict: "label" });
  }

  async upsertSeries(supabase) {
    await supabase.from("alert_time_series").delete().neq("id", 0);

    let anchor = new Date();
    if (this.timeBuckets.size > 0) {
      const latestKey = Array.from(this.timeBuckets.keys()).reduce((latest, current) =>
        new Date(current) > new Date(latest) ? current : latest
      );
      anchor = new Date(latestKey);
    }
    anchor.setUTCMinutes(0, 0, 0);

    const series = [];
    for (let i = 23; i >= 0; i -= 1) {
      const slot = new Date(anchor.getTime() - i * 60 * 60 * 1000);
      const key = `${slot.toISOString().slice(0, 13)}:00:00Z`;
      const bucket = this.timeBuckets.get(key) || { critical: 0, high: 0, medium: 0, low: 0 };
      series.push({
        time: key,
        critical: bucket.critical,
        high: bucket.high,
        medium: bucket.medium,
        low: bucket.low,
      });
    }

    if (series.length) {
      await supabase.from("alert_time_series").insert(series);
    }
  }

  severityFill(name) {
    const key = String(name || "").toLowerCase();
    const palette = {
      critical: "hsl(0, 72%, 51%)",
      high: "hsl(38, 92%, 50%)",
      medium: "hsl(199, 89%, 48%)",
      low: "hsl(142, 71%, 45%)",
    };
    return palette[key] || "hsl(0, 0%, 50%)";
  }

  async upsertSeverity(supabase) {
    await supabase.from("severity_distribution").delete().neq("name", "");

    const payload = Object.entries(this.severityCounts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      fill: this.severityFill(name),
    }));

    if (payload.length) {
      await supabase.from("severity_distribution").insert(payload);
    }
  }

  async upsertAttackSources(supabase) {
    const total = Math.max(this.totalAlerts, 1);
    const sources = Array.from(this.attackCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([country, count], index) => ({
        country: country || `Source ${index + 1}`,
        count,
        percentage: Number(((count / total) * 100).toFixed(1)),
      }));

    await supabase.from("attack_sources").delete().neq("country", "");
    if (sources.length) {
      await supabase.from("attack_sources").insert(sources);
    }
  }

  async upsertAlerts(supabase) {
    await supabase.from("alerts").delete().neq("id", "");
    if (this.alertRecords.length) {
      await this.insertInBatches(supabase, "alerts", this.alertRecords, 100);
    }
  }

  async upsertLogs(supabase) {
    await supabase.from("logs").delete().neq("id", "");
    if (this.logRecords.length) {
      await this.insertInBatches(supabase, "logs", this.logRecords, 100);
    }
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

async function run() {
  await loadEnv();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Supabase URL or service role key missing.");
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ingestor = new DashboardIngestor();
  await ingestor.ingestFiles();
  await ingestor.persist(supabase);

  console.log(`Dashboard data refreshed with CSV values. Alerts=${ingestor.alertRecords.length}, Logs=${ingestor.logRecords.length}`);
}

run().catch((error) => {
  console.error("Importer failed:", error);
  process.exit(1);
});

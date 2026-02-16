const fs = require("node:fs");
const path = require("node:path");
const { Client } = require("pg");

async function main() {
  const client = new Client({
    host: process.env.PGHOST || "127.0.0.1",
    port: Number(process.env.PGPORT || 54322),
    user: process.env.PGUSER || "postgres",
    password: process.env.PGPASSWORD || "postgres",
    database: process.env.PGDATABASE || "postgres",
  });

  await client.connect();

  const [tablesRes, colsRes, pkRes, fkRes, idxRes] = await Promise.all([
    client.query(`
      select table_name
      from information_schema.tables
      where table_schema='public' and table_type='BASE TABLE'
      order by table_name;
    `),
    client.query(`
      select table_name, column_name, data_type, udt_name, is_nullable, column_default
      from information_schema.columns
      where table_schema='public'
      order by table_name, ordinal_position;
    `),
    client.query(`
      select tc.table_name, kcu.column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name
       and tc.table_schema = kcu.table_schema
      where tc.table_schema='public'
        and tc.constraint_type='PRIMARY KEY'
      order by tc.table_name, kcu.ordinal_position;
    `),
    client.query(`
      select tc.table_name, kcu.column_name, ccu.table_name as foreign_table_name, ccu.column_name as foreign_column_name
      from information_schema.table_constraints tc
      join information_schema.key_column_usage kcu
        on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
      join information_schema.constraint_column_usage ccu
        on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
      where tc.constraint_type='FOREIGN KEY' and tc.table_schema='public'
      order by tc.table_name, kcu.column_name;
    `),
    client.query(`
      select t.relname as table_name, i.relname as index_name, pg_get_indexdef(ix.indexrelid) as index_def
      from pg_class t
      join pg_index ix on t.oid = ix.indrelid
      join pg_class i on i.oid = ix.indexrelid
      join pg_namespace n on n.oid = t.relnamespace
      where n.nspname = 'public'
      order by t.relname, i.relname;
    `),
  ]);

  await client.end();

  const colsByTable = new Map();
  for (const c of colsRes.rows) {
    if (!colsByTable.has(c.table_name)) colsByTable.set(c.table_name, []);
    colsByTable.get(c.table_name).push(c);
  }

  const pkByTable = new Map();
  for (const p of pkRes.rows) {
    if (!pkByTable.has(p.table_name)) pkByTable.set(p.table_name, []);
    pkByTable.get(p.table_name).push(p.column_name);
  }

  const fkByTable = new Map();
  for (const f of fkRes.rows) {
    if (!fkByTable.has(f.table_name)) fkByTable.set(f.table_name, []);
    fkByTable.get(f.table_name).push(f);
  }

  const idxByTable = new Map();
  for (const i of idxRes.rows) {
    if (!idxByTable.has(i.table_name)) idxByTable.set(i.table_name, []);
    idxByTable.get(i.table_name).push(i);
  }

  const lines = [];
  lines.push("# Database Schema (Full)");
  lines.push("");
  lines.push(`Generated from live DB on ${new Date().toISOString()}`);
  lines.push("");
  lines.push(
    `Connection used: \`postgresql://${process.env.PGUSER || "postgres"}:***@${process.env.PGHOST || "127.0.0.1"}:${process.env.PGPORT || "54322"}/${process.env.PGDATABASE || "postgres"}\``
  );
  lines.push("");
  lines.push("## Tables");
  lines.push("");

  for (const t of tablesRes.rows) {
    lines.push(`- ${t.table_name}`);
  }
  lines.push("");

  for (const t of tablesRes.rows) {
    const table = t.table_name;
    lines.push(`## ${table}`);
    lines.push("");

    const pk = pkByTable.get(table) || [];
    lines.push(`Primary key: ${pk.length ? `\`${pk.join(", ")}\`` : "none"}`);
    lines.push("");

    lines.push("| Column | Type | Nullable | Default |");
    lines.push("|---|---|---|---|");
    for (const c of colsByTable.get(table) || []) {
      const type = c.data_type === "ARRAY" ? `${c.udt_name}[]` : c.data_type;
      const nullable = c.is_nullable === "YES" ? "yes" : "no";
      const def = c.column_default ? String(c.column_default).replace(/\|/g, "\\|") : "";
      lines.push(`| ${c.column_name} | ${type} | ${nullable} | ${def} |`);
    }
    lines.push("");

    const fks = fkByTable.get(table) || [];
    if (fks.length) {
      lines.push("Foreign keys:");
      for (const f of fks) {
        lines.push(`- \`${f.column_name}\` -> \`${f.foreign_table_name}.${f.foreign_column_name}\``);
      }
      lines.push("");
    }

    const idxs = idxByTable.get(table) || [];
    if (idxs.length) {
      lines.push("Indexes:");
      for (const i of idxs) {
        lines.push(`- \`${i.index_name}\`: ${i.index_def}`);
      }
      lines.push("");
    }
  }

  const docsDir = path.join(process.cwd(), "docs");
  fs.mkdirSync(docsDir, { recursive: true });
  const outPath = path.join(docsDir, "database-schema-full.md");
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote ${outPath}`);
}

main().catch((error) => {
  console.error("Failed to export schema:", error);
  process.exit(1);
});


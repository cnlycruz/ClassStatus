import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const sourcePath = path.resolve(process.cwd(), "data", "suspensions.json");
const raw = fs.readFileSync(sourcePath, "utf8");
const parsed = JSON.parse(raw);
const records = Array.isArray(parsed) ? parsed : parsed?.records;
if (!Array.isArray(records)) throw new Error("The suspension file is neither a record array nor a schema-v2 document.");

function eventKey(record) {
  return createHash("sha256").update([
    record.lguId,
    record.schoolId || "lgu",
    record.effectiveDate,
    record.status,
    [...record.affectedLevels].sort().join(","),
    record.schoolSector,
    record.isAllDay ? "all-day" : `${record.startTime || ""}-${record.endTime || ""}`,
  ].join("|")).digest("hex");
}

function conflictKey(record) {
  return [
    record.lguId,
    record.schoolId || "lgu",
    record.effectiveDate,
    [...record.affectedLevels].sort().join(","),
    record.schoolSector,
    record.isAllDay ? "all-day" : `${record.startTime || ""}-${record.endTime || ""}`,
  ].join("|");
}

const prepared = records.map((record, index) => {
  if (!record || typeof record !== "object" || typeof record.id !== "string" || !Array.isArray(record.affectedLevels)) {
    throw new Error(`Record ${index + 1} is invalid.`);
  }
  const provenance = record.publicationProvenance?.type;
  if (provenance !== "manual-admin" && provenance !== "automatic-collector") {
    throw new Error(`Record ${index + 1} has no explicit supported publication provenance.`);
  }
  if (provenance === "automatic-collector" && !["rappler-walang-pasok", "gma-news-walang-pasok"].includes(record.source?.id)) {
    throw new Error(`Record ${index + 1} is not from an operational collector source.`);
  }
  const computedEventKey = eventKey(record);
  if (record.eventKey && record.eventKey !== computedEventKey) throw new Error(`Record ${index + 1} has a conflicting event key.`);
  return { record: { ...record, eventKey: computedEventKey }, eventKey: computedEventKey, conflictKey: conflictKey(record) };
});

const namespace = process.env.CLASSSTATUS_SUPABASE_NAMESPACE;
if (namespace !== "preview" && namespace !== "production") throw new Error("Set CLASSSTATUS_SUPABASE_NAMESPACE to preview or production.");
const digest = createHash("sha256").update(raw).digest("hex");
const confirmation = `${namespace}:${digest}`;
if (!process.argv.includes("--apply")) {
  console.log(`Dry run: ${prepared.length} suspension record(s) validated for the ${namespace} namespace.`);
  console.log(`To apply this exact file, rerun with --apply and CLASSSTATUS_IMPORT_CONFIRM=${confirmation}.`);
  process.exit(0);
}
if (process.env.CLASSSTATUS_IMPORT_CONFIRM !== confirmation) throw new Error("Import confirmation does not match the namespace and exact file digest.");

const url = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;
if (!url || !secretKey) throw new Error("SUPABASE_URL and the server-only SUPABASE_SECRET_KEY are required to apply an import.");
const client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await client.rpc(`classstatus_${namespace}_import_suspensions`, { p_records: prepared });
if (error) throw new Error("The transactional import RPC rejected the import.");
console.log(`Import complete: ${data.imported} inserted, ${data.skipped} already present.`);

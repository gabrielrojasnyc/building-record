// Independent check of public/data/complexes.json against the city's portal.
// Does not import the app or the pipeline. Never selects the inspector field.
// Usage: node portal-check.mjs <path to public/data>
import fs from "node:fs";
import path from "node:path";

const dataDir = process.argv[2];
const meta = JSON.parse(fs.readFileSync(path.join(dataDir, "meta.json"), "utf8"));
const complexes = JSON.parse(fs.readFileSync(path.join(dataDir, "complexes.json"), "utf8"));
const PULL_DAY = meta.pulledAt; // YYYY-MM-DD, Austin calendar
// The data files were written at 20:30 CST on 2026-11-14, so rows changed after 02:20 UTC on the 15th changed after the pull.
const PULL_MOMENT_UTC = process.env.PULL_MOMENT_UTC ?? "2026-11-15T02:20:00";

const IDS = (process.env.IDS ?? "").split(",").filter(Boolean);

const back = (years) => `${Number(PULL_DAY.slice(0, 4)) - years}${PULL_DAY.slice(4)}`;
const START = { m12: back(1), y2: back(2), y3: back(3) };

const headers = process.env.SOCRATA_APP_TOKEN ? { "X-App-Token": process.env.SOCRATA_APP_TOKEN } : {};
const BASE = "https://data.austintexas.gov/resource/6wtj-zbtb.json";

async function rowsFor(parcelIds) {
  const where = `parcelid in (${parcelIds.map((id) => `'${id}'`).join(",")}) AND opened_date >= '${START.y3}'`;
  const rows = [];
  for (let offset = 0; ; offset += 1000) {
    const url = new URL(BASE);
    url.searchParams.set(
      "$select",
      "case_id,parcelid,description,status,opened_date,closed_date,last_update,violationcasenumber,:created_at,:updated_at",
    );
    url.searchParams.set("$where", where);
    url.searchParams.set("$order", "case_id");
    url.searchParams.set("$limit", "1000");
    url.searchParams.set("$offset", String(offset));
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
    const page = await res.json();
    rows.push(...page);
    if (page.length < 1000) return rows;
  }
}

const CATEGORY_WORDS = ["structure condition", "property abatement", "land use", "work without permit"];
const FIXED = new Set([
  "Inspection Performed/Abated by Inspector",
  "Inspection Performed/Abated by Community Court",
  "Inspection Performed/ Voluntary Compliance",
]);

function outcomeOf(row) {
  const phrase = (row.last_update ?? "").trim();
  if (phrase === "Closed/Duplicate Case") return "duplicate";
  if ((row.violationcasenumber ?? "").trim() !== "") return "violation";
  if (/(?<!No )Violation\(s\) Found/.test(phrase)) return "violation";
  if (FIXED.has(phrase)) return "fixed";
  if (phrase.includes("No Violation(s) Found")) return "none";
  if (row.status !== "Closed") return "open";
  return "other";
}

const OUTCOMES = ["violation", "fixed", "none", "other", "open"];

function expectedFor(rows) {
  const out = {};
  for (const period of ["m12", "y2", "y3"]) out[period] = { total: 0, duplicates: 0, ...Object.fromEntries(OUTCOMES.map((o) => [o, 0])) };
  out.open3 = 0;
  out.violationsOpen = 0;
  const late = [];
  for (const row of rows) {
    const text = (row.description ?? "").toLowerCase();
    if (!CATEGORY_WORDS.some((word) => text.includes(word))) continue;
    const opened = row.opened_date.slice(0, 10);
    if (opened > PULL_DAY || opened < START.y3) continue;
    const outcome = outcomeOf(row);
    if (row[":updated_at"] > PULL_MOMENT_UTC || row[":created_at"] > PULL_MOMENT_UTC) {
      late.push({ case_id: row.case_id, opened, status: row.status, closed: row.closed_date?.slice(0, 10), outcome, created: row[":created_at"], updated: row[":updated_at"] });
    }
    for (const period of ["m12", "y2", "y3"]) {
      if (opened < START[period]) continue;
      if (outcome === "duplicate") out[period].duplicates += 1;
      else {
        out[period].total += 1;
        out[period][outcome] += 1;
      }
    }
    if (outcome !== "duplicate" && row.status !== "Closed") {
      out.open3 += 1;
      if (outcome === "violation") out.violationsOpen += 1;
    }
  }
  return { out, late };
}

function publishedFor(c) {
  const out = {};
  for (const period of ["m12", "y2", "y3"]) {
    const cell = { total: 0, duplicates: c.duplicates[period], ...Object.fromEntries(OUTCOMES.map((o) => [o, 0])) };
    for (const outcomes of Object.values(c.tally[period])) for (const [o, n] of Object.entries(outcomes)) { cell[o] += n; cell.total += n; }
    out[period] = cell;
  }
  out.open3 = c.open;
  out.violationsOpen = c.violationsOpen;
  return out;
}

const report = [];
let mismatches = 0;
for (const id of IDS) {
  const c = complexes.find((x) => x.id === id);
  if (!c) throw new Error(`no complex ${id}`);
  const rows = await rowsFor(c.parcelIds);
  const { out: expected, late } = expectedFor(rows);
  const actual = publishedFor(c);
  const cells = [];
  for (const period of ["m12", "y2", "y3"]) {
    for (const key of ["total", ...OUTCOMES, "duplicates"]) {
      cells.push({ period, key, portal: expected[period][key], published: actual[period][key] });
    }
  }
  cells.push({ period: "y3", key: "open (not closed)", portal: expected.open3, published: actual.open3 });
  cells.push({ period: "y3", key: "violationsOpen", portal: expected.violationsOpen, published: actual.violationsOpen });
  const diffs = cells.filter((x) => x.portal !== x.published);
  mismatches += diffs.length;
  report.push({ id, parcelIds: c.parcelIds, address: c.address, rowsRead: rows.length, cells, diffs, late });
}

fs.writeFileSync(process.env.OUT ?? "portal-check-result.json", JSON.stringify(report, null, 1));
for (const r of report) {
  console.log(`\n${r.id} ${r.address} parcels=${r.parcelIds.join("+")} rows=${r.rowsRead} diffs=${r.diffs.length} lateRows=${r.late.length}`);
  for (const period of ["m12", "y2", "y3"]) {
    console.log(
      `  ${period.padEnd(3)} ` +
        ["total", ...OUTCOMES, "duplicates"]
          .map((k) => {
            const x = r.cells.find((cell) => cell.period === period && cell.key === k);
            return `${k}:${x.portal}/${x.published}${x.portal === x.published ? "" : "*"}`;
          })
          .join(" "),
    );
  }
  for (const k of ["open (not closed)", "violationsOpen"]) {
    const x = r.cells.find((cell) => cell.key === k);
    console.log(`  y3  ${k}: ${x.portal}/${x.published}${x.portal === x.published ? "" : "*"}`);
  }
  for (const d of r.diffs) console.log("  DIFF", JSON.stringify(d));
  for (const l of r.late) console.log("  LATE", JSON.stringify(l));
}
console.log(`\nmismatching cells: ${mismatches}`);

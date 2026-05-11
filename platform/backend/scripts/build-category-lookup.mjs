import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import readline from "node:readline";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const datasetsDir = join(repoRoot, "datasets");
const urlClassificationPath = join(datasetsDir, "URL Classification.csv");
const dmozPath = join(datasetsDir, "dmoz.csv");
const outputLookupPath = join(repoRoot, "platform", "backend", "data", "domain-category-lookup.json");
const outputSummaryPath = join(repoRoot, "platform", "backend", "data", "category-dataset-summary.json");

const CATEGORY_MAP = [
  { pattern: /^adult$/i, category: "adult" },
  { pattern: /arts|animation|comics|music|movies|tv|radio|celebrity/i, category: "entertainment" },
  { pattern: /business|finance|invest|marketing|real estate|jobs/i, category: "work" },
  { pattern: /computers|internet|software|programming|developer|technology|web/i, category: "work" },
  { pattern: /education|reference|science|library|research|knowledge/i, category: "learning" },
  { pattern: /games|gaming/i, category: "gaming" },
  { pattern: /health|fitness|medical/i, category: "health" },
  { pattern: /shopping|autos|vehicles|marketplace|ecommerce/i, category: "shopping" },
  { pattern: /news|media|magazine|journalism|weather/i, category: "news" },
  { pattern: /social|society|people|community|forum|message board|chat|dating/i, category: "social" },
  { pattern: /sports|recreation/i, category: "entertainment" },
  { pattern: /travel|regional|local/i, category: "other" }
];

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values.map((value) => value.trim());
}

function normalizeDomain(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    return hostname || null;
  } catch {
    return null;
  }
}

function normalizeCategory(rawCategory) {
  const trimmed = rawCategory.trim();
  if (!trimmed) {
    return "other";
  }

  for (const rule of CATEGORY_MAP) {
    if (rule.pattern.test(trimmed)) {
      return rule.category;
    }
  }

  return "other";
}

function incrementCounter(counter, key) {
  counter[key] = (counter[key] ?? 0) + 1;
}

async function buildUrlClassificationLookup() {
  const domainVotes = new Map();
  const rawCategoryCounts = {};
  const normalizedCategoryCounts = {};

  let totalRows = 0;
  let skippedRows = 0;

  const stream = createReadStream(urlClassificationPath, "utf8");
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of reader) {
    if (!line.trim()) {
      continue;
    }

    const firstComma = line.indexOf(",");
    const lastComma = line.lastIndexOf(",");
    if (firstComma === -1 || lastComma === -1 || firstComma === lastComma) {
      skippedRows += 1;
      continue;
    }

    const rawUrl = line.slice(firstComma + 1, lastComma).trim();
    const rawCategory = line.slice(lastComma + 1).trim();
    const domain = normalizeDomain(rawUrl);

    if (!domain || !rawCategory) {
      skippedRows += 1;
      continue;
    }

    totalRows += 1;
    incrementCounter(rawCategoryCounts, rawCategory);

    const normalizedCategory = normalizeCategory(rawCategory);
    incrementCounter(normalizedCategoryCounts, normalizedCategory);

    const categoryVotes = domainVotes.get(domain) ?? new Map();
    categoryVotes.set(rawCategory, (categoryVotes.get(rawCategory) ?? 0) + 1);
    domainVotes.set(domain, categoryVotes);
  }

  const lookup = {};
  for (const [domain, categoryVotes] of domainVotes.entries()) {
    let selectedCategory = null;
    let selectedVotes = -1;

    for (const [rawCategory, votes] of categoryVotes.entries()) {
      if (votes > selectedVotes) {
        selectedCategory = rawCategory;
        selectedVotes = votes;
      }
    }

    lookup[domain] = {
      rawCategory: selectedCategory,
      normalizedCategory: normalizeCategory(selectedCategory ?? "other"),
      votes: selectedVotes
    };
  }

  return {
    lookup,
    summary: {
      totalRows,
      skippedRows,
      uniqueDomains: Object.keys(lookup).length,
      rawCategoryCounts,
      normalizedCategoryCounts
    }
  };
}

async function analyzeDmozCategories() {
  const topLevelCounts = {};
  const rawCategoryCounts = {};
  const normalizedCategoryCounts = {};

  let totalRows = 0;
  let skippedRows = 0;
  let sawHeader = false;

  const stream = createReadStream(dmozPath, "utf8");
  const reader = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of reader) {
    if (!line.trim()) {
      continue;
    }

    const columns = parseCsvLine(line);
    if (!sawHeader) {
      sawHeader = true;
      continue;
    }

    const rawCategory = columns[1]?.trim();
    if (!rawCategory) {
      skippedRows += 1;
      continue;
    }

    totalRows += 1;
    incrementCounter(rawCategoryCounts, rawCategory);

    const topLevelCategory = rawCategory.split("/")[0].trim();
    incrementCounter(topLevelCounts, topLevelCategory);

    const normalizedCategory = normalizeCategory(rawCategory);
    incrementCounter(normalizedCategoryCounts, normalizedCategory);
  }

  return {
    totalRows,
    skippedRows,
    uniqueRawCategories: Object.keys(rawCategoryCounts).length,
    topLevelCounts,
    rawCategoryCounts,
    normalizedCategoryCounts
  };
}

function sortObjectByValue(input) {
  return Object.fromEntries(Object.entries(input).sort((a, b) => b[1] - a[1]));
}

async function main() {
  const [{ lookup, summary: urlSummary }, dmozSummary] = await Promise.all([
    buildUrlClassificationLookup(),
    analyzeDmozCategories()
  ]);

  const lookupPayload = {
    generatedAt: new Date().toISOString(),
    sourceFiles: {
      urlClassification: "datasets/URL Classification.csv",
      dmoz: "datasets/dmoz.csv"
    },
    lookup
  };

  const summaryPayload = {
    generatedAt: new Date().toISOString(),
    sourceFiles: {
      urlClassification: "datasets/URL Classification.csv",
      dmoz: "datasets/dmoz.csv"
    },
    normalizedCategories: [...new Set(CATEGORY_MAP.map((rule) => rule.category).concat("other"))].sort(),
    urlClassification: {
      ...urlSummary,
      rawCategoryCounts: sortObjectByValue(urlSummary.rawCategoryCounts),
      normalizedCategoryCounts: sortObjectByValue(urlSummary.normalizedCategoryCounts)
    },
    dmoz: {
      ...dmozSummary,
      topLevelCounts: sortObjectByValue(dmozSummary.topLevelCounts),
      rawCategoryCounts: sortObjectByValue(dmozSummary.rawCategoryCounts),
      normalizedCategoryCounts: sortObjectByValue(dmozSummary.normalizedCategoryCounts)
    }
  };

  await mkdir(dirname(outputLookupPath), { recursive: true });
  await writeFile(outputLookupPath, JSON.stringify(lookupPayload, null, 2), "utf8");
  await writeFile(outputSummaryPath, JSON.stringify(summaryPayload, null, 2), "utf8");

  console.log(`Wrote domain lookup to ${outputLookupPath}`);
  console.log(`Wrote category summary to ${outputSummaryPath}`);
  console.log(`Unique domains: ${urlSummary.uniqueDomains}`);
  console.log(`URL rows processed: ${urlSummary.totalRows}`);
  console.log(`DMOZ rows processed: ${dmozSummary.totalRows}`);
}

await main();

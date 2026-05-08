require("dotenv/config");
const { Client } = require("@notionhq/client");
const { endSection, printSection, SECTION_DIVIDER } = require("../format");
const { prompt } = require("../io");
const { log } = require("../../../src/logger");
const { syncNewVocabularies } = require("../../../src/services/notionService");
const { loadConfig } = require("../../../src/services/configService");
const { createPrismaClient } = require("../../../src/db");
const { parseVocabularyPage } = require("../../../src/parsers/notionParser");

function getNotion() {
  if (!process.env.NOTION_TOKEN) throw new Error("NOTION_TOKEN is not set in .env");
  return new Client({ auth: process.env.NOTION_TOKEN });
}

function parseJson(str) {
  try {
    return JSON.parse(str || "[]");
  } catch {
    return [];
  }
}

// ─── pull ────────────────────────────────────────────────────────────────────

async function cmdNotionPull() {
  await syncNewVocabularies();
}

// ─── check ───────────────────────────────────────────────────────────────────

async function cmdNotionCheck() {
  const config = loadConfig();
  const lastSync = config.lastNotionSync;
  const db = createPrismaClient();

  try {
    log.step("Notion", "Checking sync status...");
    const dbCount = await db.notionCache.count();
    log.info(`DB has ${dbCount} cached entries`);
    log.detail("Last sync", lastSync ? new Date(lastSync).toLocaleString() : "never");

    if (!lastSync) {
      log.warn("Database has never been synced — run: pnpm run dev notion pull");
      return;
    }

    log.step("Notion", "Scanning Notion for pages updated since last sync...");
    const notion = getNotion();
    let pending = 0;
    let cursor;
    let done = false;

    do {
      const res = await notion.search({
        filter: { property: "object", value: "page" },
        sort: { direction: "descending", timestamp: "last_edited_time" },
        start_cursor: cursor,
        page_size: 100,
      });

      for (const page of res.results) {
        if (new Date(page.last_edited_time) > new Date(lastSync)) {
          pending++;
        } else {
          done = true;
          break;
        }
      }

      cursor = !done && res.has_more ? res.next_cursor : undefined;
    } while (cursor);

    printSection("[Notion Check]");
    console.log(`  DB cached entries      : ${dbCount}`);
    console.log(`  Last sync              : ${new Date(lastSync).toLocaleString()}`);
    console.log(`  Pages updated since    : ${pending}`);
    endSection();

    if (pending > 0) {
      log.warn(`${pending} page(s) in Notion have changed since last sync`);
      const answer = await prompt("Pull updates now? [y/N] ");
      if (answer.toLowerCase() === "y") await cmdNotionPull();
    } else {
      log.success("Database is up to date with Notion");
    }
  } finally {
    await db.$disconnect();
  }
}

// ─── update ──────────────────────────────────────────────────────────────────

async function cmdNotionUpdate(args) {
  const word = args.join(" ").trim();
  if (!word) {
    log.error('Usage: pnpm run dev notion update "<word>"');
    return;
  }

  const db = createPrismaClient();

  try {
    const entry = await db.notionCache.findFirst({
      where: { word: { equals: word, mode: "insensitive" } },
    });

    if (!entry) {
      log.error(`Word not found in DB: "${word}"`);
      log.info(`Try: pnpm run dev notion view "${word}" or vocab "${word}" to search`);
      return;
    }

    log.step("Notion", `Fetching latest Notion data for "${entry.word}"...`);
    log.detail("Page ID", entry.pageId);

    const notion = getNotion();
    const page = await notion.pages.retrieve({ page_id: entry.pageId });
    const data = await parseVocabularyPage(page);

    if (!data.word) {
      log.error("Page returned no word title — aborting update");
      return;
    }

    await db.notionCache.update({
      where: { pageId: data.pageId },
      data: {
        word: data.word,
        partOfSpeech: data.partOfSpeech,
        definition: data.definition,
        sentences: data.sentences,
        transformations: data.transformations,
        synonyms: data.synonyms,
        antonyms: data.antonyms,
        commonPhrases: data.commonPhrases,
      },
    });

    log.success(`"${data.word}" updated in DB`);
  } finally {
    await db.$disconnect();
  }
}

// ─── view ─────────────────────────────────────────────────────────────────────

async function cmdNotionView(args) {
  const word = args.join(" ").trim();
  if (!word) {
    log.error('Usage: pnpm run dev notion view "<word>"');
    return;
  }

  const db = createPrismaClient();

  try {
    const entry = await db.notionCache.findFirst({
      where: { word: { equals: word, mode: "insensitive" } },
    });

    if (!entry) {
      log.error(`Word not found: "${word}"`);
      return;
    }

    const vocab = await db.vocabulary.findFirst({ where: { pageId: entry.pageId } });
    const definitions = parseJson(entry.definition);
    const sentences = parseJson(entry.sentences);
    const synonyms = parseJson(entry.synonyms);
    const antonyms = parseJson(entry.antonyms);
    const transformations = parseJson(entry.transformations);
    const phrases = parseJson(entry.commonPhrases);

    printSection(`[${entry.word}]`);
    console.log(`  Page ID        : ${entry.pageId}`);
    console.log(`  Part of speech : ${entry.partOfSpeech || "(none)"}`);
    console.log(`  Stage index    : ${vocab?.stageIndex ?? "(no vocab row)"}`);

    console.log("\n  Definitions:");
    definitions.length
      ? definitions.forEach((d, i) => console.log(`    ${i + 1}. ${d}`))
      : console.log("    (none)");

    console.log("\n  Sentences:");
    sentences.length
      ? sentences.forEach((s, i) => console.log(`    ${i + 1}. ${s}`))
      : console.log("    (none)");

    console.log(`\n  Synonyms        : ${synonyms.join(", ") || "(none)"}`);
    console.log(`  Antonyms        : ${antonyms.join(", ") || "(none)"}`);
    console.log(`  Transformations : ${transformations.join(", ") || "(none)"}`);

    if (phrases.length) {
      console.log("\n  Common Phrases:");
      phrases.forEach((p) => console.log(`    - ${p}`));
    }

    endSection();
  } finally {
    await db.$disconnect();
  }
}

// ─── warn ─────────────────────────────────────────────────────────────────────

async function cmdNotionWarn() {
  log.step("Notion", "Scanning for entries with missing required fields...");
  const db = createPrismaClient();

  const REQUIRED = ["word", "partOfSpeech", "definition", "sentences"];

  try {
    const all = await db.notionCache.findMany();
    const issues = [];

    for (const entry of all) {
      const missing = [];
      if (!entry.word) missing.push("word");
      if (!entry.partOfSpeech) missing.push("partOfSpeech");
      if (parseJson(entry.definition).length === 0) missing.push("definition");
      if (parseJson(entry.sentences).length === 0) missing.push("sentences");
      if (missing.length > 0) issues.push({ entry, missing });
    }

    printSection("[Notion Warn]");
    console.log(`  Scanned  : ${all.length} entries`);
    console.log(`  Required : ${REQUIRED.join(", ")}`);
    console.log(`  Issues   : ${issues.length}\n`);

    if (issues.length === 0) {
      log.success("All entries have the required fields");
    } else {
      for (const { entry, missing } of issues) {
        console.log(`  ⚠  "${entry.word || "(no word)"}"  →  missing: ${missing.join(", ")}`);
        console.log(`     Page ID : ${entry.pageId}`);
      }
      console.log();
      log.info(`Run: pnpm run dev notion update "<word>" to re-sync a specific entry`);
    }

    endSection();
  } finally {
    await db.$disconnect();
  }
}

// ─── fix ──────────────────────────────────────────────────────────────────────

async function cmdNotionFix() {
  log.step("Notion", "Finding entries with missing required fields...");
  const db = createPrismaClient();

  try {
    const all = await db.notionCache.findMany();
    const targets = all.filter((entry) => {
      if (!entry.word) return true;
      if (!entry.partOfSpeech) return true;
      if (parseJson(entry.definition).length === 0) return true;
      if (parseJson(entry.sentences).length === 0) return true;
      return false;
    });

    if (targets.length === 0) {
      log.success("No incomplete entries found — nothing to fix");
      return;
    }

    log.info(`Found ${targets.length} incomplete entries — re-fetching from Notion...`);

    const notion = getNotion();

    let fixed = 0;
    let failed = 0;

    for (let i = 0; i < targets.length; i++) {
      const entry = targets[i];
      log.progress(i + 1, targets.length, `"${entry.word || entry.pageId.slice(0, 8)}"`);

      try {
        const page = await notion.pages.retrieve({ page_id: entry.pageId });
        const data = await parseVocabularyPage(page);

        if (!data.word) {
          log.warn(`Still no word title for ${entry.pageId} — skipping`);
          failed++;
          continue;
        }

        await db.notionCache.update({
          where: { pageId: data.pageId },
          data: {
            word: data.word,
            partOfSpeech: data.partOfSpeech,
            definition: data.definition,
            sentences: data.sentences,
            transformations: data.transformations,
            synonyms: data.synonyms,
            antonyms: data.antonyms,
            commonPhrases: data.commonPhrases,
          },
        });

        fixed++;
      } catch (err) {
        log.error(`Failed "${entry.word || entry.pageId}": ${err.message}`);
        failed++;
      }
    }

    log.divider();
    log.success(`Fixed : ${fixed}`);
    if (failed > 0) log.error(`Failed: ${failed}`);
    log.info("Run: pnpm run dev notion warn  to verify remaining issues");
  } finally {
    await db.$disconnect();
  }
}

// ─── help ─────────────────────────────────────────────────────────────────────

function printHelp() {
  console.log(SECTION_DIVIDER);
  console.log("[Notion] Subcommands:");
  console.log(SECTION_DIVIDER);
  const subs = [
    { name: "pull", desc: "Pull new/updated pages from Notion into the database" },
    { name: "check", desc: "Compare DB with Notion, prompt to pull if out of date" },
    { name: "update <word>", desc: "Re-fetch a single word's page from Notion and update DB" },
    { name: "view <word>", desc: "Display full details of a word from the local DB" },
    { name: "warn", desc: "List entries missing required fields (word/POS/definition/sentences)" },
    { name: "fix", desc: "Re-fetch all incomplete entries from Notion and attempt to fix them" },
  ];
  for (const sub of subs) {
    console.log(`  pnpm run dev notion ${sub.name.padEnd(16)} ${sub.desc}`);
  }
  console.log(SECTION_DIVIDER);
  console.log("  Log level set via config.json → logLevel: silent|error|warn|info|debug");
  console.log(SECTION_DIVIDER);
}

// ─── entry ────────────────────────────────────────────────────────────────────

async function cmdNotion(args) {
  const [sub, ...rest] = args;
  switch (sub) {
    case "pull":
      return cmdNotionPull();
    case "check":
      return cmdNotionCheck();
    case "update":
      return cmdNotionUpdate(rest);
    case "view":
      return cmdNotionView(rest);
    case "warn":
      return cmdNotionWarn();
    case "fix":
      return cmdNotionFix();
    case "help":
      return printHelp();
    default:
      printHelp();
  }
}

module.exports = { cmdNotion };

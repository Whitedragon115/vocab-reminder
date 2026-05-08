const { Client } = require("@notionhq/client");
const { createPrismaClient } = require("../db");
const { parseVocabularyPage } = require("../parsers/notionParser");
const { loadConfig, saveConfig } = require("./configService");
const { log } = require("../logger");

const RECONNECT_EVERY = 50;
const notion = new Client({ auth: process.env.NOTION_TOKEN });

async function fetchAllPages(since) {
  const pages = [];
  let cursor = undefined;
  let pageNum = 1;

  log.step("Notion", "Fetching pages from Notion...");

  do {
    log.info(`Fetching batch ${pageNum} (up to 100 pages)...`);
    const res = await notion.search({
      filter: { property: "object", value: "page" },
      sort: { direction: "ascending", timestamp: "last_edited_time" },
      start_cursor: cursor,
      page_size: 100,
    });

    let batchNew = 0;
    for (const page of res.results) {
      if (!since || new Date(page.last_edited_time) > new Date(since)) {
        pages.push(page);
        batchNew++;
      }
    }

    log.info(`Batch ${pageNum}: ${res.results.length} pages fetched, ${batchNew} new/updated`);
    cursor = res.has_more ? res.next_cursor : undefined;
    pageNum++;
  } while (cursor);

  return pages;
}

async function syncNewVocabularies() {
  const config = loadConfig();
  const since = config.lastNotionSync;

  log.divider("Notion Sync");
  log.step("Notion", "Starting sync...");
  log.detail("Since", since ? new Date(since).toLocaleString() : "beginning (first run)");

  const pages = await fetchAllPages(since);

  if (pages.length === 0) {
    log.success("No new pages found — database is up to date");
    log.divider();
    return;
  }

  log.step("Notion", `Processing ${pages.length} page(s)...`);

  let synced = 0;
  let skipped = 0;
  let failed = 0;
  let db = createPrismaClient();

  const existing = await db.notionCache.findMany({ select: { pageId: true } });
  const existingIds = new Set(existing.map((e) => e.pageId));
  const newPages = pages.filter((p) => !existingIds.has(p.id));
  const skippedExisting = pages.length - newPages.length;

  if (skippedExisting > 0) {
    log.info(`Skipping ${skippedExisting} page(s) already in DB — only processing ${newPages.length} new`);
  }

  if (newPages.length === 0) {
    await db.$disconnect();
    log.success("No new words to add — all pages already exist in DB");
    log.info("To fix incomplete entries, run: pnpm run dev notion fix");
    log.divider();
    return;
  }

  for (let i = 0; i < newPages.length; i++) {
    if (i > 0 && i % RECONNECT_EVERY === 0) {
      await db.$disconnect();
      db = createPrismaClient();
      log.info(`Reconnected DB at page ${i + 1}`);
    }

    const page = newPages[i];

    try {
      const data = await parseVocabularyPage(page);

      if (!data.word) {
        log.progress(i + 1, newPages.length, `⚠ Skipped — no word title`);
        skipped++;
        continue;
      }

      log.progress(i + 1, newPages.length, `"${data.word}" (${data.partOfSpeech || "no POS"})`);

      await db.notionCache.upsert({
        where: { pageId: data.pageId },
        update: {
          word: data.word,
          partOfSpeech: data.partOfSpeech,
          definition: data.definition,
          sentences: data.sentences,
          transformations: data.transformations,
          synonyms: data.synonyms,
          antonyms: data.antonyms,
          commonPhrases: data.commonPhrases,
        },
        create: data,
      });

      await db.vocabulary.upsert({
        where: { pageId: data.pageId },
        update: {},
        create: { word: data.word, pageId: data.pageId, stageIndex: 0 },
      });

      synced++;
    } catch (err) {
      log.progress(i + 1, newPages.length, `✗ Failed: ${err.message}`);
      failed++;
    }
  }

  await db.$disconnect();

  config.lastNotionSync = new Date().toISOString();
  saveConfig(config);

  log.divider();
  log.success(`Synced:  ${synced}`);
  if (skipped > 0) log.warn(`Skipped: ${skipped}`);
  if (failed > 0) log.error(`Failed:  ${failed}`);
  log.divider();
}

module.exports = { syncNewVocabularies };

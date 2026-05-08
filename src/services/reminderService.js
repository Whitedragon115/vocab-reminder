const { createPrismaClient } = require("../db");
const { loadConfig } = require("./configService");
const { buildEmbeds } = require("../parsers/templateParser");
const { log } = require("../logger");

function weightedSample(pool, weights, n) {
  const selected = [];
  const remaining = [...pool];

  for (let i = 0; i < n && remaining.length > 0; i++) {
    const total = remaining.reduce((sum, v) => sum + (weights[v.stageIndex] ?? 1), 0);
    let rand = Math.random() * total;

    for (let j = 0; j < remaining.length; j++) {
      rand -= weights[remaining[j].stageIndex] ?? 1;
      if (rand <= 0) {
        selected.push(remaining[j]);
        remaining.splice(j, 1);
        break;
      }
    }
  }

  return selected;
}

async function selectVocabularies() {
  log.divider("Reminder");
  const config = loadConfig();
  const { forgettingCurveWeight, vocabulariesPerReminder } = config;
  const n = vocabulariesPerReminder ?? 5;
  const maxStage = forgettingCurveWeight.length - 1;
  const db = createPrismaClient();

  log.step("Reminder", "Loading vocabulary from database...");
  const all = await db.vocabulary.findMany();

  if (all.length === 0) {
    log.warn("No vocabulary found — run pnpm run sync first");
    await db.$disconnect();
    return [];
  }

  log.info(`${all.length} total words in database`);

  const stage0 = all.filter((v) => v.stageIndex === 0);
  const pool = all.filter((v) => v.stageIndex > 0);

  log.step("Reminder", `Selecting ${n} words using forgetting curve...`);
  log.detail("Stage-0 (new/unseen)", stage0.length);
  log.detail("Stage 1+ (in rotation)", pool.length);

  let selected;
  if (stage0.length >= n) {
    log.info(`Stage-0 fills all ${n} slots — picking randomly from new words`);
    selected = stage0.sort(() => Math.random() - 0.5).slice(0, n);
  } else {
    selected = [...stage0];
    const remaining = n - stage0.length;
    if (stage0.length > 0) log.info(`${stage0.length} new word(s) added`);
    if (remaining > 0 && pool.length > 0) {
      log.info(`Weighted sampling ${remaining} word(s) from stage 1+ pool...`);
      selected.push(...weightedSample(pool, forgettingCurveWeight, remaining));
    }
  }

  log.step("Reminder", "Selected words:");
  for (const v of selected) {
    log.info(`"${v.word}" (stage ${v.stageIndex} → ${Math.min(v.stageIndex + 1, maxStage)})`);
  }

  log.step("Reminder", "Advancing stage indices in database...");
  for (const vocab of selected) {
    const nextStage = Math.min(vocab.stageIndex + 1, maxStage);
    await db.vocabulary.update({ where: { id: vocab.id }, data: { stageIndex: nextStage } });
  }
  log.success(`Updated ${selected.length} words`);

  await db.$disconnect();
  log.divider();
  return selected;
}

async function buildReminderEmbeds(selected) {
  log.step("Reminder", "Fetching cache entries to build embeds...");
  const db = createPrismaClient();
  const pageIds = selected.map((v) => v.pageId);
  const cacheEntries = await db.notionCache.findMany({ where: { pageId: { in: pageIds } } });
  await db.$disconnect();

  const ordered = pageIds.map((id) => cacheEntries.find((c) => c.pageId === id)).filter(Boolean);
  log.success(`Built ${ordered.length} embed(s)`);
  return buildEmbeds(ordered);
}

module.exports = { selectVocabularies, buildReminderEmbeds };

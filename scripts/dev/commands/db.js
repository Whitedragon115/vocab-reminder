import { endSection, printSection, SECTION_DIVIDER } from "../format.js";
import { parseJsonList } from "../utils.js";

export async function cmdDb() {
  const { createPrismaClient } = await import("../../../src/db.js");
  const db = createPrismaClient();

  try {
    const vocabCount = await db.vocabulary.count();
    const cacheCount = await db.notionCache.count();
    const stageCounts = await db.vocabulary.groupBy({
      by: ["stageIndex"],
      _count: { stageIndex: true },
      orderBy: { stageIndex: "asc" },
    });

    printSection("[DB Stats]");
    console.log(`  Vocabulary rows : ${vocabCount}`);
    console.log(`  NotionCache rows: ${cacheCount}`);
    console.log("\n  Stage distribution:");

    for (const stage of stageCounts) {
      const label = stage.stageIndex === 0 ? " (always shown)" : "";
      console.log(
        `    Stage ${String(stage.stageIndex).padStart(2)}: ${stage._count.stageIndex} words${label}`,
      );
    }

    endSection();

    console.log("\n  DB management commands:");

    const cmds = [
      {
        name: "backup",
        safe: true,
        desc: "Copy data.db to data/backups/ with a timestamp. Keeps last 10.",
      },
      {
        name: "restore",
        safe: true,
        desc: "Pick a backup to restore. Auto-backs up current DB first.",
      },
      {
        name: "reset",
        safe: true,
        desc: "Set all stageIndex to 0 — words cycle through again from scratch.",
      },
      {
        name: "clean",
        safe: true,
        desc: "Remove orphaned rows that have no matching pair across tables.",
      },
      {
        name: "clear",
        safe: false,
        desc: "DELETE all vocabulary, cache, and sync history. Irreversible.",
      },
    ];

    for (const cmd of cmds) {
      const danger = cmd.safe ? "        " : " ⚠ DANGER";
      console.log(`\n  pnpm run dev ${cmd.name}${danger}`);
      console.log(`    ${cmd.desc}`);
    }

    console.log(SECTION_DIVIDER);
  } finally {
    await db.$disconnect();
  }
}

export async function cmdVocab(args) {
  const query = args[0];
  const { createPrismaClient } = await import("../../../src/db.js");
  const db = createPrismaClient();

  try {
    const where = query ? { word: { contains: query } } : {};
    const entries = await db.notionCache.findMany({ where, take: 5 });

    if (entries.length === 0) {
      console.log(`No entries found${query ? ` matching "${query}"` : ""}`);
      return;
    }

    for (const entry of entries) {
      const definitions = parseJsonList(entry.definition);
      const sentences = parseJsonList(entry.sentences);
      const synonyms = parseJsonList(entry.synonyms);
      const antonyms = parseJsonList(entry.antonyms);
      const transformations = parseJsonList(entry.transformations);

      printSection("");
      console.log(`  Word        : ${entry.word} (${entry.partOfSpeech || "no POS"})`);
      console.log(`  Definition  : ${definitions[0] ?? "(none)"}`);
      console.log(`  Sentences   : ${sentences[0]?.slice(0, 80) ?? "(none)"}...`);
      console.log(`  Synonyms    : ${synonyms.join(", ") || "(none)"}`);
      console.log(`  Antonyms    : ${antonyms.join(", ") || "(none)"}`);
      console.log(`  Transforms  : ${transformations.join(", ") || "(none)"}`);
    }

    endSection();
  } finally {
    await db.$disconnect();
  }
}

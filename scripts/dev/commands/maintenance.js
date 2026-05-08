const fs = require("fs");
const path = require("path");
const { endSection, printSection } = require("../format");
const { prompt } = require("../io");
const { formatTimestamp } = require("../utils");
const { createPrismaClient } = require("../../../src/db");
const { loadConfig, saveConfig } = require("../../../src/services/configService");

function getDatabasePath() {
  return path.resolve("data/data.db");
}

function getBackupDirectory() {
  return path.resolve("data/backups");
}

function getBackupFiles(backupDir) {
  return fs
    .readdirSync(backupDir)
    .filter((file) => file.endsWith(".db"))
    .sort()
    .reverse();
}

async function cmdBackup() {
  const dbPath = getDatabasePath();

  if (!fs.existsSync(dbPath)) {
    console.log("No database found at data/data.db");
    process.exit(1);
  }

  const stats = fs.statSync(dbPath);
  const sizeMb = (stats.size / 1024 / 1024).toFixed(2);

  printSection("[Backup] Database info:");
  console.log(`  Path : ${dbPath}`);
  console.log(`  Size : ${sizeMb} MB`);
  console.log(`  Modified: ${stats.mtime.toLocaleString()}`);
  endSection();

  const answer = await prompt("Back up data/data.db now? [y/N] ");
  if (answer.toLowerCase() !== "y") {
    console.log("  Cancelled.");
    return;
  }

  const backupDir = getBackupDirectory();
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const destPath = path.join(backupDir, `data-${formatTimestamp(new Date())}.db`);
  fs.copyFileSync(dbPath, destPath);

  const backups = getBackupFiles(backupDir);
  if (backups.length > 10) {
    for (const oldFile of backups.slice(10)) {
      fs.unlinkSync(path.join(backupDir, oldFile));
      console.log(`  Removed old backup: ${oldFile}`);
    }
  }

  console.log(`  Backed up to: ${destPath}`);
  console.log(`  Total backups: ${Math.min(backups.length, 10)}`);
  endSection();
}

async function cmdReset() {
  const db = createPrismaClient();

  try {
    const stageCounts = await db.vocabulary.groupBy({
      by: ["stageIndex"],
      _count: { stageIndex: true },
      orderBy: { stageIndex: "asc" },
    });
    const total = stageCounts.reduce((sum, row) => sum + row._count.stageIndex, 0);
    const alreadyZero = stageCounts.find((row) => row.stageIndex === 0)?._count.stageIndex ?? 0;

    printSection("[Reset] Reset all stage indices to 0");
    console.log(`  Total words   : ${total}`);
    console.log(`  Already at 0  : ${alreadyZero}`);
    console.log(`  Will reset    : ${total - alreadyZero}`);
    console.log("  Effect: all words become 'new' and will cycle through again");
    endSection();

    if (total - alreadyZero === 0) {
      console.log("  Nothing to reset - all words are already at stage 0.");
      return;
    }

    const answer = await prompt("Reset all stage indices to 0? [y/N] ");
    if (answer.toLowerCase() !== "y") {
      console.log("  Cancelled.");
      return;
    }

    await db.vocabulary.updateMany({ data: { stageIndex: 0 } });
    console.log(`  Reset ${total} words to stage 0`);
    endSection();
  } finally {
    await db.$disconnect();
  }
}

async function cmdClean() {
  const db = createPrismaClient();

  try {
    const allVocab = await db.vocabulary.findMany({
      select: { id: true, word: true, pageId: true },
    });
    const allCache = await db.notionCache.findMany({
      select: { id: true, word: true, pageId: true },
    });
    const cachePageIds = new Set(allCache.map((entry) => entry.pageId));
    const vocabPageIds = new Set(allVocab.map((entry) => entry.pageId));
    const orphanVocab = allVocab.filter((entry) => !cachePageIds.has(entry.pageId));
    const orphanCache = allCache.filter((entry) => !vocabPageIds.has(entry.pageId));

    printSection("[Clean] Orphaned record check:");
    console.log(`  Vocabulary rows with no cache entry : ${orphanVocab.length}`);
    console.log(`  Cache rows with no vocabulary entry : ${orphanCache.length}`);

    if (orphanVocab.length > 0) {
      console.log("\n  Orphan vocabulary entries:");
      for (const entry of orphanVocab) {
        console.log(`    - "${entry.word}" (${entry.pageId.slice(0, 8)}...)`);
      }
    }

    if (orphanCache.length > 0) {
      console.log("\n  Orphan cache entries:");
      for (const entry of orphanCache) {
        console.log(`    - "${entry.word}" (${entry.pageId.slice(0, 8)}...)`);
      }
    }

    endSection();

    if (orphanVocab.length === 0 && orphanCache.length === 0) {
      console.log("  Database is clean - no orphaned records found.");
      return;
    }

    const answer = await prompt(
      `Delete ${orphanVocab.length + orphanCache.length} orphaned record(s)? [y/N] `,
    );
    if (answer.toLowerCase() !== "y") {
      console.log("  Cancelled.");
      return;
    }

    if (orphanVocab.length > 0) {
      await db.vocabulary.deleteMany({
        where: { pageId: { in: orphanVocab.map((entry) => entry.pageId) } },
      });
      console.log(`  Deleted ${orphanVocab.length} orphan vocabulary row(s)`);
    }

    if (orphanCache.length > 0) {
      await db.notionCache.deleteMany({
        where: { pageId: { in: orphanCache.map((entry) => entry.pageId) } },
      });
      console.log(`  Deleted ${orphanCache.length} orphan cache row(s)`);
    }

    endSection();
  } finally {
    await db.$disconnect();
  }
}

async function cmdClear() {
  const db = createPrismaClient();

  try {
    const vocabCount = await db.vocabulary.count();
    const cacheCount = await db.notionCache.count();

    printSection("[Clear] This will permanently delete ALL data");
    console.log(`  Vocabulary rows : ${vocabCount}`);
    console.log(`  NotionCache rows: ${cacheCount}`);
    console.log("  lastNotionSync will also be cleared (next sync fetches everything)");
    endSection();

    const answer = await prompt('Type "clear" to confirm complete data wipe: ');
    if (answer !== "clear") {
      console.log("  Cancelled.");
      return;
    }

    await db.vocabulary.deleteMany({});
    await db.notionCache.deleteMany({});

    const config = loadConfig();
    config.lastNotionSync = null;
    saveConfig(config);

    console.log(`  Deleted ${vocabCount} vocabulary rows`);
    console.log(`  Deleted ${cacheCount} cache rows`);
    console.log("  Cleared lastNotionSync - run pnpm run sync to re-populate");
    endSection();
  } finally {
    await db.$disconnect();
  }
}

async function cmdRestore() {
  const backupDir = getBackupDirectory();
  const dbPath = getDatabasePath();

  if (!fs.existsSync(backupDir)) {
    console.log("No backups found. Run: pnpm run dev backup");
    return;
  }

  const backups = getBackupFiles(backupDir);
  if (backups.length === 0) {
    console.log("No backup files found in data/backups/");
    return;
  }

  printSection("[Restore] Available backups:");
  backups.forEach((file, index) => {
    const stats = fs.statSync(path.join(backupDir, file));
    const sizeMb = (stats.size / 1024 / 1024).toFixed(2);
    console.log(`  [${index + 1}] ${file}  (${sizeMb} MB)`);
  });
  endSection();

  const choice = await prompt(
    `Select backup to restore [1-${backups.length}] or Enter to cancel: `,
  );
  const index = Number.parseInt(choice, 10) - 1;

  if (!choice || Number.isNaN(index) || index < 0 || index >= backups.length) {
    console.log("  Cancelled.");
    return;
  }

  const selected = backups[index];
  const srcPath = path.join(backupDir, selected);

  console.log(`\n  Selected: ${selected}`);
  const confirm = await prompt("  This will overwrite data/data.db. Restore? [y/N] ");
  if (confirm.toLowerCase() !== "y") {
    console.log("  Cancelled.");
    return;
  }

  if (fs.existsSync(dbPath)) {
    const autoBackup = path.join(backupDir, `data-${formatTimestamp(new Date())}-prerestore.db`);
    fs.copyFileSync(dbPath, autoBackup);
    console.log(`  Auto-backed up current DB to: ${path.basename(autoBackup)}`);
  }

  fs.copyFileSync(srcPath, dbPath);
  console.log(`  Restored from: ${selected}`);
  endSection();
}

module.exports = { cmdBackup, cmdClean, cmdClear, cmdReset, cmdRestore };

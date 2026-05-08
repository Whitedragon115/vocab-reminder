const { cmdDb, cmdVocab } = require("./commands/db");
const { cmdDiscord } = require("./commands/discord");
const { cmdBackup, cmdClean, cmdClear, cmdReset, cmdRestore } = require("./commands/maintenance");
const { cmdNews } = require("./commands/news");
const { cmdNotion } = require("./commands/notion");
const { cmdRemind } = require("./commands/remind");
const { cmdSimulate } = require("./commands/simulate");
const { closePrompt } = require("./io");

const commands = {
  db: {
    run: cmdDb,
    usage: "",
    description: "Show database stats and stage distribution",
  },
  vocab: {
    run: cmdVocab,
    usage: "[query]",
    description: "Look up words in the cache (first 5 matches)",
    details: ["Omit query to list the first 5 entries.", 'Example: pnpm run dev vocab "amiable"'],
  },
  news: {
    run: cmdNews,
    usage: "[word1 word2 ...]",
    description: "Test news generation with given words",
    details: [
      "Fetches a real article and rewrites it using the provided words.",
      "Example: pnpm run dev news amiable benevolent resilient",
    ],
  },
  discord: {
    run: cmdDiscord,
    usage: "",
    description: "Send a test embed to Discord",
  },
  notion: {
    run: cmdNotion,
    usage: "<subcommand> [args]",
    description: "Manage Notion sync (pull / check / update / view / warn)",
    details: [
      "pnpm run dev notion pull            Pull new/updated pages from Notion",
      "pnpm run dev notion check           Compare DB with Notion, prompt to pull",
      "pnpm run dev notion update <word>   Re-fetch a single word from Notion",
      "pnpm run dev notion view <word>     Show full word details from DB",
      "pnpm run dev notion warn            List entries missing required fields",
      "pnpm run dev notion fix             Re-fetch all incomplete entries from Notion",
      "",
      "Log verbosity: set logLevel in config.json (silent|error|warn|info|debug)",
    ],
  },
  remind: {
    run: cmdRemind,
    usage: "",
    description: "Run the full reminder flow (select + send)",
    details: [
      "Selects words by the forgetting curve, advances their stage, and posts to Discord.",
      "This modifies the database — stage indices will be incremented.",
    ],
  },
  simulate: {
    run: cmdSimulate,
    usage: "[rounds]",
    description: "Simulate forgetting curve over N rounds (default 30)",
    details: [
      "Runs a dry simulation using the current DB words and config weights.",
      "Does not modify the database.",
      "Example: pnpm run dev simulate 100",
    ],
  },
  backup: {
    run: cmdBackup,
    usage: "",
    description: "Backup the database (prompts for confirmation)",
    details: ["Saves a timestamped copy to data/backups/. Keeps the 10 most recent backups."],
  },
  reset: {
    run: cmdReset,
    usage: "",
    description: "Reset all stage indices to 0 (restart forgetting curve)",
    details: ["All words become 'new' again. Prompts for confirmation."],
  },
  clean: {
    run: cmdClean,
    usage: "",
    description: "Delete orphaned DB records with no matching pair",
    details: [
      "Finds vocabulary rows with no cache entry and vice versa.",
      "Safe to run anytime — previews orphans before deleting.",
    ],
  },
  clear: {
    run: cmdClear,
    usage: "",
    description: "Wipe all data (requires typing 'clear' to confirm)",
    details: [
      "Deletes all vocabulary and cache rows, and clears lastNotionSync.",
      "Run pnpm run sync afterward to re-populate.",
    ],
  },
  restore: {
    run: cmdRestore,
    usage: "",
    description: "Restore database from a backup file",
    details: [
      "Lists available backups and prompts for selection.",
      "Auto-backs up the current DB before restoring.",
    ],
  },
  help: {
    run: cmdHelp,
    usage: "[command]",
    description: "Show help for all commands or a specific command",
  },
};

function printUsage() {
  console.log("Usage: pnpm run dev <command> [args]");
  console.log("");
  console.log("Commands:");

  for (const [name, config] of Object.entries(commands)) {
    const syntax = config.usage ? ` ${config.usage}` : "";
    console.log(`  ${(name + syntax).padEnd(24)} ${config.description}`);
  }

  console.log("");
  console.log('Run "pnpm run dev help <command>" for details on a specific command.');
}

function cmdHelp(args) {
  const target = args[0];

  if (!target) {
    printUsage();
    return;
  }

  const config = commands[target];
  if (!config) {
    console.log(`Unknown command: "${target}"`);
    console.log("");
    printUsage();
    return;
  }

  const syntax = config.usage ? ` ${config.usage}` : "";
  console.log(`pnpm run dev ${target}${syntax}`);
  console.log("");
  console.log(`  ${config.description}`);

  if (config.details?.length) {
    console.log("");
    for (const line of config.details) {
      console.log(`  ${line}`);
    }
  }
}

async function runDev(argv) {
  const [command, ...args] = argv;
  const selected = command ? commands[command] : null;

  if (!selected) {
    printUsage();
    closePrompt();
    process.exit(0);
  }

  try {
    await selected.run(args);
  } catch (error) {
    console.error(`[dev:${command}] Error:`, error.message);
  } finally {
    closePrompt();
  }
}

async function runCommand(argv) {
  const [command, ...args] = argv;
  const selected = command ? commands[command] : null;

  if (!selected) {
    printUsage();
    return;
  }

  try {
    await selected.run(args);
  } catch (error) {
    console.error(`[dev:${command}] Error:`, error.message);
  }
}

module.exports = { runDev, runCommand };

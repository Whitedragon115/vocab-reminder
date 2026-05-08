require("dotenv/config");
const { startScheduler, runNotionSync } = require("./src/scheduler");

async function main() {
  console.log("[Boot] Starting vocabulary reminder bot...");
  await runNotionSync();
  startScheduler();
  console.log("[Boot] Bot is running. Press Ctrl+C to stop.");
}

main().catch((err) => {
  console.error("[Boot] Fatal error:", err);
  process.exit(1);
});

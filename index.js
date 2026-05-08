const { execSync } = require("child_process");
execSync("npx prisma generate", { stdio: "inherit" });
execSync("npx prisma migrate deploy", { stdio: "inherit" });

require("dotenv/config");
const { startScheduler, runNotionSync } = require("./src/scheduler");
const { runCommand } = require("./scripts/dev/index");
const { prompt, closePrompt } = require("./scripts/dev/io");

async function startCli() {
  console.log('[CLI] Bot is running. Type "help" for commands, "exit" to stop.');

  while (true) {
    const line = await prompt("bot> ");
    if (!line) continue;

    if (line === "exit" || line === "quit") {
      console.log("[CLI] Shutting down...");
      closePrompt();
      process.exit(0);
    }

    const argv = line.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((t) => t.replace(/^"|"$/g, "")) ?? [];
    await runCommand(argv);
    console.log("");
  }
}

async function main() {
  console.log("[Boot] Starting vocabulary reminder bot...");
  await runNotionSync();
  startScheduler();
  startCli();
}

main().catch((err) => {
  console.error("[Boot] Fatal error:", err);
  process.exit(1);
});

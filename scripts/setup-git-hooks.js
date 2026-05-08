const { existsSync } = require("fs");
const { spawnSync } = require("child_process");

if (!existsSync(".git")) {
  process.exit(0);
}

const result = spawnSync("git", ["config", "core.hooksPath", ".husky"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

if (result.error) {
  console.warn("Skipping Git hook setup:", result.error.message);
  process.exit(0);
}

if (result.status !== 0) {
  console.warn("Skipping Git hook setup: git config could not be updated.");
  process.exit(0);
}

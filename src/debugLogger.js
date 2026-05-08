import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../data/config.json");
const LOG_DIR = path.resolve(__dirname, "../data/logs");

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
};

function isDebugEnabled() {
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
    return config.debug === true || config.logLevel === "debug";
  } catch {
    return false;
  }
}

function getLogPath() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `debug-${date}.log`);
}

function writeToFile(entry) {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(getLogPath(), JSON.stringify(entry, null, 2) + "\n" + "─".repeat(60) + "\n");
}

export function debugRequest(service, action, payload) {
  if (!isDebugEnabled()) return;

  const timestamp = new Date().toISOString();
  console.log(`${c.magenta}${c.bold}[DEBUG ▶ ${service}] ${action}${c.reset}`);
  console.log(`${c.dim}${JSON.stringify(payload, null, 2)}${c.reset}`);

  writeToFile({ type: "request", timestamp, service, action, payload });
}

export function debugResponse(service, action, payload) {
  if (!isDebugEnabled()) return;

  const timestamp = new Date().toISOString();
  console.log(`${c.magenta}${c.bold}[DEBUG ◀ ${service}] ${action}${c.reset}`);
  console.log(`${c.gray}${JSON.stringify(payload, null, 2)}${c.reset}`);

  writeToFile({ type: "response", timestamp, service, action, payload });
}

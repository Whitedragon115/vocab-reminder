import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(__dirname, "../data/config.json");

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  brightGreen: "\x1b[92m",
  brightYellow: "\x1b[93m",
  brightCyan: "\x1b[96m",
};

// USD per 1M tokens — input / output
const DEFAULT_PRICING = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  o1: { input: 15.0, output: 60.0 },
  "o1-mini": { input: 1.1, output: 4.4 },
  "gpt-5": { input: 5.0, output: 15.0 },
};

// 0=silent 1=error 2=warn 3=info 4=debug
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3, debug: 4 };

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return {};
  }
}

function currentLevel() {
  const config = readConfig();
  return LEVELS[config.logLevel] ?? LEVELS.info;
}

function at(needed) {
  return currentLevel() >= LEVELS[needed];
}

function loadPricing() {
  const config = readConfig();
  return { ...DEFAULT_PRICING, ...(config.modelPricing ?? {}) };
}

function loadCurrency() {
  return readConfig().currency ?? null;
}

function findPrice(model, pricing) {
  if (pricing[model]) return pricing[model];
  const key = Object.keys(pricing).find((k) => model.startsWith(k));
  return key ? pricing[key] : null;
}

function formatCost(usd, currency) {
  const usdStr = `$${usd.toFixed(6)} USD`;
  if (!currency?.rate) return usdStr;
  return `${usdStr}  (${(usd * currency.rate).toFixed(2)} ${currency.code})`;
}

const session = {
  calls: [],
  inputTokens: 0,
  outputTokens: 0,
  cost: 0,
};

function tag(label, color) {
  return `${color}${c.bold}[${label}]${c.reset}`;
}

function fmt(color, text) {
  return `${color}${text}${c.reset}`;
}

export const log = {
  divider: (label = "") => {
    if (!at("info")) return;
    if (label) {
      console.log(
        `${c.gray}── ${c.cyan}${c.bold}${label}${c.reset} ${c.gray}${"─".repeat(38 - label.length)}${c.reset}`,
      );
    } else {
      console.log(fmt(c.gray, "─".repeat(42)));
    }
  },

  step: (module, msg) => {
    if (!at("info")) return;
    console.log(`${tag(module, c.cyan)} ${fmt(c.brightCyan, msg)}`);
  },

  info: (msg) => {
    if (!at("info")) return;
    console.log(`  ${fmt(c.gray, msg)}`);
  },

  detail: (key, value) => {
    if (!at("debug")) return;
    console.log(`  ${fmt(c.gray, key + ":")} ${fmt(c.dim, String(value))}`);
  },

  success: (msg) => {
    if (!at("info")) return;
    console.log(`  ${fmt(c.brightGreen, "✓")} ${fmt(c.green, msg)}`);
  },

  warn: (msg) => {
    if (!at("warn")) return;
    console.log(`  ${fmt(c.brightYellow, "⚠")} ${fmt(c.yellow, msg)}`);
  },

  error: (msg) => {
    if (!at("error")) return;
    console.log(`  ${fmt(c.red, "✗")} ${fmt(c.red, msg)}`);
  },

  ai: (msg) => {
    if (!at("info")) return;
    console.log(`  ${fmt(c.magenta, "✦ AI")} ${fmt(c.magenta, msg)}`);
  },

  progress: (current, total, label) => {
    if (!at("info")) return;
    console.log(`  ${fmt(c.gray, `[${current}/${total}]`)} ${label}`);
  },

  tokens: (label, model, usage) => {
    if (!at("info")) return;
    const pricing = loadPricing();
    const currency = loadCurrency();
    const price = findPrice(model, pricing);

    const input = usage?.prompt_tokens ?? 0;
    const output = usage?.completion_tokens ?? 0;
    const total = usage?.total_tokens ?? input + output;

    let callCost = 0;
    let costStr;

    if (price) {
      callCost = (input / 1_000_000) * price.input + (output / 1_000_000) * price.output;
      costStr = fmt(c.yellow, formatCost(callCost, currency));
    } else {
      costStr = fmt(c.gray, "unknown pricing — add to modelPricing in config.json");
    }

    session.calls.push({ label, input, output, cost: callCost });
    session.inputTokens += input;
    session.outputTokens += output;
    session.cost += callCost;

    console.log(
      `  ${fmt(c.blue, "⬡")} ${fmt(c.bold, label.padEnd(22))} ` +
        `${fmt(c.dim, `in:${String(input).padStart(5)} out:${String(output).padStart(4)} total:${String(total).padStart(5)}`)}  ${costStr}`,
    );
  },

  tokenSummary: () => {
    if (!at("info") || session.calls.length === 0) return;
    const currency = loadCurrency();

    console.log(`\n${fmt(c.gray, "─".repeat(42))}`);
    console.log(`  ${fmt(c.blue, "⬡ Token Usage Summary")}`);
    console.log(fmt(c.gray, "─".repeat(42)));

    for (const call of session.calls) {
      const total = call.input + call.output;
      console.log(
        `  ${fmt(c.dim, call.label.padEnd(22))} ` +
          `${fmt(c.gray, `in:${String(call.input).padStart(5)} out:${String(call.output).padStart(4)} total:${String(total).padStart(5)}`)}  ` +
          `${fmt(c.yellow, formatCost(call.cost, currency))}`,
      );
    }

    console.log(fmt(c.gray, "─".repeat(42)));
    const grandTotal = session.inputTokens + session.outputTokens;
    console.log(
      `  ${fmt(c.bold, "Total".padEnd(22))} ` +
        `${fmt(c.dim, `in:${String(session.inputTokens).padStart(5)} out:${String(session.outputTokens).padStart(4)} total:${String(grandTotal).padStart(5)}`)}  ` +
        `${fmt(c.brightYellow, formatCost(session.cost, currency))}`,
    );
    console.log(fmt(c.gray, "─".repeat(42)));
  },
};

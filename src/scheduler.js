import "dotenv/config";
import cron from "node-cron";
import { syncNewVocabularies } from "./services/notionService.js";
import { selectVocabularies, buildReminderEmbeds } from "./services/reminderService.js";
import { buildNewsContent } from "./services/newsService.js";
import { sendReminder } from "./services/discordService.js";
import { loadConfig } from "./services/configService.js";
import { log } from "./logger.js";

const TIME_ZONE = process.env.TIME_ZONE ?? "UTC";

function timeToCron(timeStr) {
  const [hour, minute] = timeStr.split(":").map(Number);
  return `${minute} ${hour} * * *`;
}

export async function runReminder() {
  try {
    log.step(
      "Scheduler",
      `Reminder triggered at ${new Date().toLocaleString("en-US", { timeZone: TIME_ZONE })}`,
    );

    const selected = await selectVocabularies();
    if (selected.length === 0) {
      log.warn("No vocabularies to send — run a Notion sync first");
      return;
    }

    const embeds = await buildReminderEmbeds(selected);
    const words = selected.map((v) => v.word);

    const config = loadConfig();
    let newsContent = null;
    if (config.news?.enabled) {
      try {
        newsContent = await buildNewsContent(words);
      } catch (err) {
        log.error(`Failed to generate news passage: ${err.message}`);
      }
    } else {
      log.info("News is disabled in config — skipping");
    }

    log.step("Scheduler", "Sending to Discord...");
    await sendReminder(embeds, newsContent);
    log.success(`Sent ${selected.length} vocabulary embed(s)${newsContent ? " + news" : ""}`);
  } catch (err) {
    log.error(`Reminder failed: ${err.message}`);
  }
}

export async function runNotionSync() {
  try {
    log.step("Scheduler", "Notion sync triggered");
    await syncNewVocabularies();
  } catch (err) {
    log.error(`Notion sync failed: ${err.message}`);
  }
}

export function startScheduler() {
  const config = loadConfig();
  const raw = config.reminderFrequency ?? process.env.REMINDER_FREQUENCY ?? "08:00";
  const frequencies = Array.isArray(raw) ? raw : raw.split(",").map((t) => t.trim());

  log.divider("Scheduler");
  for (const time of frequencies) {
    const expr = timeToCron(time);
    cron.schedule(expr, runReminder, { timezone: TIME_ZONE });
    log.success(`Reminder scheduled at ${time} (${TIME_ZONE})`);
  }

  cron.schedule("0 0 * * *", runNotionSync, { timezone: TIME_ZONE });
  log.success(`Notion sync scheduled at 00:00 (${TIME_ZONE})`);
  log.divider();
}

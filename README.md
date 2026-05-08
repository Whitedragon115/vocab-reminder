# DC Vocabulary — Discord Vocabulary Reminder Bot

A Discord bot that reminds you of English vocabulary you've saved in Notion, using the **Forgetting Curve** to prioritise words you're most likely to forget. Each reminder also includes an AI-generated news passage that naturally incorporates the day's vocabulary words.

---

## How It Works

1. **Notion Sync** — The bot reads your Notion vocabulary database and stores each word in a local SQLite database via Prisma.
2. **Forgetting Curve** — Each word has a `stageIndex` tracking how many times it's been shown. New words always appear first; older words appear less frequently as their weight decreases.
3. **Reminder** — At each scheduled time, the bot picks N words (based on your config), builds a Discord embed per word, and sends it to you via DM or webhook.
4. **News Passage** — The bot fetches a news headline matching your interests, then uses ChatGPT to rewrite it as a ~300-word passage that includes all the reminder words (bolded).

---

## Prerequisites

- Node.js 18+
- pnpm
- A Notion integration with access to your vocabulary database
- A Discord bot token (DM mode) or webhook URL (Ping mode)
- A NewsAPI key
- An OpenAI API key

---

## Setup

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure `.env`

Copy the template below and fill in your values:

```env
# Delivery mode: "DM" to send a direct message, "Ping" to use a webhook
MODE=DM

# Your Discord user ID (right-click your name → Copy User ID)
DISCORD_ID=your_discord_user_id

# Notion integration token
NOTION_TOKEN=your_notion_token

# The child data source ID of your Notion vocabulary database
NOTION_DATABASE_SOURCE_ID=your_notion_source_id

# NewsAPI key (https://newsapi.org)
NEWSAPI_KEY=your_newsapi_key

# OpenAI API key
CHATGPT_KEY=your_openai_key

# OpenAI model to use
CHATGPT_MODEL=gpt-4o-mini

# Your local timezone (IANA format, e.g. Asia/Taipei, America/New_York)
TIME_ZONE=Asia/Taipei

# Comma-separated times (HH:MM) to send reminders each day
REMINDER_FREQUENCY="08:00,12:00,18:00,21:00"

# --- Required only if MODE=Ping ---
DISCORD_WEBHOOK=your_webhook_url

# --- Required only if MODE=DM ---
DISCORD_TOKEN=your_bot_token
DISCORD_BOT_ID=your_bot_application_id
```

### 3. Configure `data/config.json`

Edit `data/config.json` to personalise your experience:

```json
{
  "vocabulariesPerReminder": 5,
  "forgettingCurveWeight": [-1, 90, 80, 70, 60, 50, 40, 30, 20, 10, 5, 4, 3, 2, 1],
  "lastNotionSync": null,
  "news": {
    "enabled": true,
    "topics": ["technology", "science"],
    "country": "us",
    "language": "en",
    "userPrompt": "Write in a friendly, natural tone. Keep the vocabulary highlighted in bold exactly as given."
  }
}
```

| Field                     | Description                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `vocabulariesPerReminder` | How many words are sent per reminder                                                           |
| `forgettingCurveWeight`   | Stage weights — index 0 (`-1`) means always show; each subsequent stage lowers the probability |
| `lastNotionSync`          | Set automatically — tracks the last Notion sync time (ISO string or `null`)                    |
| `news.enabled`            | Toggle the AI news passage on or off                                                           |
| `news.topics`             | Topics used to search for news articles                                                        |
| `news.country`            | Country code for NewsAPI (e.g. `us`, `tw`)                                                     |
| `news.language`           | Language code (e.g. `en`)                                                                      |
| `news.userPrompt`         | Custom instruction sent to ChatGPT for tone/style                                              |

### 4. Run the bot

```bash
pnpm start
```

On first boot, the bot syncs **all** existing words from Notion (since `lastNotionSync` is `null`). After that, only newly added words are synced at midnight each day.

---

## Commands / Scripts

| Script              | What it does                                                        |
| ------------------- | ------------------------------------------------------------------- |
| `pnpm start`        | Starts the bot — syncs Notion on boot, then runs the cron scheduler |
| `pnpm run sync`     | Manually trigger a Notion sync right now                            |
| `pnpm run remind`   | Manually trigger a reminder right now (useful for testing)          |
| `pnpm format`       | Format all files with Prettier                                      |
| `pnpm format:check` | Check formatting without modifying files                            |

---

## Forgetting Curve — How Words Are Selected

The `forgettingCurveWeight` array controls selection probability:

```
Index:  0    1   2   3   4   5   6   7   8   9  10  11  12  13  14
Value: -1   90  80  70  60  50  40  30  20  10   5   4   3   2   1
```

- **Stage 0 (weight `-1`)** — Brand new words. Always included in every reminder.
- **Stage 1–9** — Frequently shown with decreasing probability.
- **Stage 10–14** — Rarely shown; the word is likely well-memorised.

Each time a word is sent in a reminder, its `stageIndex` advances by 1 (capped at the last stage). Words at stage 0 fill the queue first; the remaining slots are filled by weighted random selection from all other words.

---

## Vocabulary Template

The reminder message layout is controlled by `src/template/vocabulary.md`. Each embed block uses this format:

```
>>> embed
<title|vocab1:word>
<description|"definition: {vocab1:meaningList}">
<description|"example: {vocab1:sentence}">
<field_inline|title:"Transformations"|content:"{vocab1:transformation}">
<field_inline|title:"Synonyms"|content:"{vocab1:synonyms}">
<<<
```

The `vocab1` placeholder is automatically replicated for each word in the reminder (`vocab2`, `vocab3`, …).

---

## Notion Database Structure

The bot expects each vocabulary page in Notion to follow this structure:

**Page properties:**

- `Word` (title) — the vocabulary word
- `Part of speech` (multi-select) — e.g. Verb, Noun
- `Structure` (rich text) — optional sentence pattern

**Page body:**

- `> Definition` → bulleted definitions below
- `Transformations` toggle → word forms
- `Synonyms` toggle → synonym list
- `Antonyms` toggle → antonym list
- `> Sentence` → `Before: <example sentence>`
- `> Common phrase` → common phrases

---

## Project Standards

This project uses Prettier for formatting and a committed Git pre-commit hook to keep staged files formatted before commit.

Run the formatter manually:

```bash
pnpm format
```

Check formatting without changing files:

```bash
pnpm format:check
```

The pre-commit hook runs:

```bash
pnpm lint-staged
```

Only staged `js`, `json`, `md`, `yml`, and `yaml` files are formatted on commit. The hook path is configured automatically during `pnpm install` via the `prepare` script.

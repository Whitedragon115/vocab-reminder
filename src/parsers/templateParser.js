const fs = require("fs");
const path = require("path");
const EmbedBuilder = require("../builders/EmbedBuilder");

const TEMPLATE_PATH = path.resolve(__dirname, "../template/vocabulary.md");

function loadTemplate() {
  return fs.readFileSync(TEMPLATE_PATH, "utf8");
}

function extractEmbedTemplate(templateContent) {
  const match = templateContent.match(/>>> embed\n([\s\S]*?)<<</);
  if (!match) throw new Error("No embed block found in vocabulary.md");
  return match[1].trim();
}

function resolveValue(raw, values) {
  if (raw.startsWith('"') && raw.endsWith('"')) {
    const inner = raw.slice(1, -1);
    return inner.replace(/\{(vocab\d+:[^}]+)\}/g, (_, key) => values[key] ?? "-");
  }
  return values[raw] ?? "-";
}

function buildEmbedFromBlock(blockText, values) {
  const embed = new EmbedBuilder();
  const lines = blockText.split("\n").map((l) => l.trim()).filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^<(\w+)\|(.+)>$/);
    if (!match) continue;
    const [, directive, argsRaw] = match;

    if (directive === "title") {
      embed.setTitle(resolveValue(argsRaw, values));
    } else if (directive === "url") {
      embed.setUrl(resolveValue(argsRaw, values));
    } else if (directive === "description") {
      const current = embed._data.description ?? "";
      const next = resolveValue(argsRaw, values);
      embed.setDescription(current ? `${current}\n${next}` : next);
    } else if (directive === "field_inline") {
      const titleMatch = argsRaw.match(/title:"([^"]*)"/);
      const contentMatch = argsRaw.match(/content:("(?:[^"]*)")/);
      if (titleMatch && contentMatch) {
        embed.addField(titleMatch[1], resolveValue(contentMatch[1], values) || "-", true);
      }
    } else if (directive === "color") {
      embed.setColor(resolveValue(argsRaw, values));
    }
  }

  return embed;
}

function asList(items) {
  if (items.length === 0) return "-";
  if (items.length === 1) return items[0];
  return items.map((item) => `• ${item}`).join("\n");
}

function buildValues(vocabIndex, cacheEntry) {
  const prefix = `vocab${vocabIndex}`;
  const definitionItems = JSON.parse(cacheEntry.definition || "[]").slice(0, 2);
  const definition =
    definitionItems.length > 1 ? "\n" + asList(definitionItems) : asList(definitionItems);
  const sentence = JSON.parse(cacheEntry.sentences || "[]")[0] || "-";
  const transformations = asList(JSON.parse(cacheEntry.transformations || "[]"));
  const synonyms = asList(JSON.parse(cacheEntry.synonyms || "[]"));
  const notionUrl = `https://www.notion.so/${cacheEntry.pageId.replace(/-/g, "")}`;

  return {
    [`${prefix}:word`]: cacheEntry.word,
    [`${prefix}:notionUrl`]: notionUrl,
    [`${prefix}:meaningList`]: definition,
    [`${prefix}:sentence`]: sentence,
    [`${prefix}:transformation`]: transformations,
    [`${prefix}:synonyms`]: synonyms,
    [`${prefix}:partOfSpeech`]: cacheEntry.partOfSpeech,
  };
}

function buildEmbeds(cacheEntries) {
  const template = loadTemplate();
  const embedTemplate = extractEmbedTemplate(template);

  return cacheEntries.map((entry, i) => {
    const vocabIndex = i + 1;
    const values = buildValues(vocabIndex, entry);
    const indexedBlock = embedTemplate.replace(/vocab1/g, `vocab${vocabIndex}`);
    return buildEmbedFromBlock(indexedBlock, values);
  });
}

module.exports = { buildEmbeds };

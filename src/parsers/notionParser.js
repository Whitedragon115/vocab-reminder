const { Client } = require("@notionhq/client");

const notion = new Client({ auth: process.env.NOTION_TOKEN });

function getPlainText(richText) {
  if (!richText || !Array.isArray(richText)) return "";
  return richText.map((t) => t.plain_text).join("").trim();
}

async function fetchToggleChildren(blockId, label) {
  try {
    const res = await notion.blocks.children.list({ block_id: blockId });
    const items = res.results
      .filter((b) => ["bulleted_list_item", "numbered_list_item", "paragraph"].includes(b.type))
      .map((b) => getPlainText(b[b.type].rich_text))
      .filter((t) => t && t !== "-");
    console.log(`       ↳ ${label}: [${items.join(", ") || "empty"}]`);
    return items;
  } catch {
    console.log(`       ↳ ${label}: (failed to fetch)`);
    return [];
  }
}

async function parsePageBlocks(pageId) {
  const res = await notion.blocks.children.list({ block_id: pageId });
  const blocks = res.results;
  console.log(`     Blocks fetched: ${blocks.length}`);

  const sections = {
    definition: [], transformations: [], synonyms: [],
    antonyms: [], sentences: [], commonPhrases: [],
  };
  let currentSection = null;

  for (const block of blocks) {
    const type = block.type;

    if (type === "quote") {
      const text = getPlainText(block.quote.rich_text).toLowerCase();
      if (text.includes("definition")) currentSection = "definition";
      else if (text.includes("sentence")) currentSection = "sentence";
      else if (text.includes("common phrase")) currentSection = "commonPhrases";
      else currentSection = null;
      continue;
    }

    if (type === "divider") { currentSection = null; continue; }

    if (type === "toggle") {
      const text = getPlainText(block.toggle.rich_text).toLowerCase();
      let key = null;
      if (text.includes("transformation")) key = "transformations";
      else if (text.includes("synonym")) key = "synonyms";
      else if (text.includes("antonym")) key = "antonyms";
      if (key && block.has_children) {
        sections[key] = await fetchToggleChildren(block.id, key);
      }
      continue;
    }

    if (type === "bulleted_list_item" && currentSection === "definition") {
      const text = getPlainText(block.bulleted_list_item.rich_text);
      if (text) sections.definition.push(text);
      continue;
    }

    if (currentSection === "sentence") {
      const richText = block[type]?.rich_text;
      const text = getPlainText(richText);
      if (text.startsWith("Before:")) {
        sections.sentences.push(text.replace(/^Before:\s*/, "").trim());
      }
      continue;
    }

    if (currentSection === "commonPhrases" && type === "bulleted_list_item") {
      const text = getPlainText(block.bulleted_list_item.rich_text);
      if (text && text !== "-") sections.commonPhrases.push(text);
    }
  }

  console.log(`     Definition: ${sections.definition.length} item(s)`);
  console.log(`     Sentence:   ${sections.sentences.length > 0 ? `"${sections.sentences[0].slice(0, 60)}..."` : "none"}`);
  return sections;
}

function parseProperties(properties) {
  const word = getPlainText(properties.Word?.title) || "";
  const partOfSpeech = (properties["Part of speech"]?.multi_select || [])
    .map((s) => s.name).join(", ");
  return { word, partOfSpeech };
}

async function parseVocabularyPage(page) {
  const { word, partOfSpeech } = parseProperties(page.properties);
  const sections = await parsePageBlocks(page.id);
  return {
    pageId: page.id,
    word,
    partOfSpeech,
    definition: JSON.stringify(sections.definition),
    sentences: JSON.stringify(sections.sentences),
    transformations: JSON.stringify(sections.transformations),
    synonyms: JSON.stringify(sections.synonyms),
    antonyms: JSON.stringify(sections.antonyms),
    commonPhrases: JSON.stringify(sections.commonPhrases),
  };
}

module.exports = { parseVocabularyPage };

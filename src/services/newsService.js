import NewsAPI from "newsapi";
import OpenAI from "openai";
import { loadConfig } from "./configService.js";
import { createPrismaClient } from "../db.js";
import { log } from "../logger.js";
import { debugRequest, debugResponse } from "../debugLogger.js";

const MAX_SEEN = 200;

async function fetchArticles(topics, language) {
  const newsapi = new NewsAPI(process.env.NEWSAPI_KEY);
  const query = topics.join(" OR ");
  log.info(`Querying NewsAPI: "${query}" [lang=${language ?? "en"}]`);

  const params = { q: query, language: language ?? "en", sortBy: "publishedAt", pageSize: 100 };
  debugRequest("NewsAPI", "v2.everything", params);

  const res = await newsapi.v2.everything(params);
  debugResponse("NewsAPI", "v2.everything", {
    totalResults: res.totalResults,
    returned: res.articles?.length ?? 0,
    articles: (res.articles ?? []).map((a) => ({
      title: a.title,
      url: a.url,
      source: a.source?.name,
    })),
  });

  const articles = (res.articles || []).filter((a) => a.title && a.description && a.url);
  log.info(`Received ${res.articles?.length ?? 0} articles, ${articles.length} usable`);
  return articles;
}

async function selectArticle(articles, userPrompt) {
  const openai = new OpenAI({ apiKey: process.env.CHATGPT_KEY });
  const config = loadConfig();
  const userBio = config.userBio ? `About the user: ${config.userBio}\n\n` : "";

  log.ai(`Asking AI to pick from ${articles.length} candidates...`);
  if (config.userBio) log.info(`User bio provided (${config.userBio.length} chars)`);

  const articleList = articles
    .map((a, i) => `${i + 1}. ${a.title}\n   ${a.description}`)
    .join("\n\n");

  const selectMessages = [
    {
      role: "system",
      content: `You are a news curator for a language learner. Based on who the user is and their preferences, pick the single most interesting and relevant article from the list. Return JSON: {"index": <1-based number>}`,
    },
    {
      role: "user",
      content: `${userBio}User preferences: "${userPrompt}"\n\nArticles:\n${articleList}`,
    },
  ];
  debugRequest("OpenAI", "article-selection", {
    model: process.env.CHATGPT_MODEL ?? "gpt-4o-mini",
    messages: selectMessages,
  });

  const completion = await openai.chat.completions.create({
    model: process.env.CHATGPT_MODEL ?? "gpt-4o-mini",
    messages: selectMessages,
    response_format: { type: "json_object" },
  });

  debugResponse("OpenAI", "article-selection", {
    raw: completion.choices[0].message.content,
    usage: completion.usage,
  });
  log.tokens("Article Selection", process.env.CHATGPT_MODEL ?? "gpt-4o-mini", completion.usage);

  const result = JSON.parse(completion.choices[0].message.content);
  const index = (result.index ?? 1) - 1;
  const chosen = index >= 0 && index < articles.length ? articles[index] : articles[0];

  log.success(`AI chose article #${index + 1}: "${chosen.title}"`);
  log.detail("Source", chosen.source?.name ?? "unknown");
  log.detail("URL", chosen.url);

  return chosen;
}

async function generatePassage(article, words, wordCount) {
  const openai = new OpenAI({ apiKey: process.env.CHATGPT_KEY });
  const config = loadConfig();
  const userPrompt = config.news.userPrompt ?? "";
  const target = wordCount ?? 300;

  log.ai(`Generating ~${target}-word passage with ${words.length} vocab words...`);
  log.detail("Words", words.join(", "));

  const systemPrompt = `You are helping an English learner. Rewrite the given news article as a ~${target} word passage that naturally includes the provided vocabulary words. Bold each vocabulary word using **word**. Follow the user's style preference. Return JSON: {"Title": "<string>", "Passage": "<string>", "Category": ["<string>"]}`;

  const userMessage = `Vocabulary words to include: ${words.join(", ")}\n\nStyle preference: "${userPrompt}"\n\nOriginal article:\nTitle: ${article.title}\n${article.description}`;

  const passageMessages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];
  debugRequest("OpenAI", "passage-generation", {
    model: process.env.CHATGPT_MODEL ?? "gpt-4o-mini",
    messages: passageMessages,
  });

  const completion = await openai.chat.completions.create({
    model: process.env.CHATGPT_MODEL ?? "gpt-4o-mini",
    messages: passageMessages,
    response_format: { type: "json_object" },
  });

  debugResponse("OpenAI", "passage-generation", {
    raw: completion.choices[0].message.content,
    usage: completion.usage,
  });
  log.tokens("Passage Generation", process.env.CHATGPT_MODEL ?? "gpt-4o-mini", completion.usage);

  const passage = JSON.parse(completion.choices[0].message.content);
  const actualWords = passage.Passage.trim().split(/\s+/).length;
  log.success(
    `Passage generated — ${actualWords} words, categories: ${(passage.Category ?? []).join(", ")}`,
  );
  return passage;
}

export async function buildNewsContent(words) {
  log.divider("News");
  const config = loadConfig();
  const { topics, language, userPrompt, wordCount } = config.news;
  const db = createPrismaClient();

  try {
    log.step("News", "Loading seen article history from database...");
    const seenCount = await db.seenNews.count();
    const seenUrls = (await db.seenNews.findMany({ select: { url: true } })).map((r) => r.url);
    log.info(`${seenCount} articles in seen history (max ${MAX_SEEN})`);

    log.step("News", "Fetching articles from NewsAPI...");
    const allArticles = await fetchArticles(topics, language);

    log.step("News", "Filtering out previously seen articles...");
    const seenSet = new Set(seenUrls);
    let candidates = allArticles.filter((a) => !seenSet.has(a.url));
    log.info(`${candidates.length} unseen out of ${allArticles.length} total`);

    if (candidates.length < 5) {
      log.warn("Too few unseen articles — clearing seen history");
      await db.seenNews.deleteMany({});
      candidates = allArticles;
    }

    if (candidates.length === 0) {
      log.error("No articles available");
      return null;
    }

    log.step("News", "AI is selecting the best article...");
    const article = await selectArticle(candidates, userPrompt ?? "");

    log.step("News", "AI is rewriting article into a vocabulary passage...");
    const passage = await generatePassage(article, words, wordCount);

    log.step("News", "Saving article to seen history...");
    await db.seenNews.create({
      data: {
        url: article.url,
        title: article.title,
        category: (passage.Category ?? []).join(", "),
      },
    });

    if (seenCount >= MAX_SEEN) {
      const oldest = await db.seenNews.findMany({
        orderBy: { seenAt: "asc" },
        take: seenCount - MAX_SEEN + 1,
        select: { id: true },
      });
      await db.seenNews.deleteMany({ where: { id: { in: oldest.map((r) => r.id) } } });
      log.info("Trimmed oldest entries to stay within limit");
    }

    log.success(`Seen history updated (${seenCount + 1} entries)`);

    const wordCountActual = passage.Passage.trim().split(/\s+/).length;
    log.tokenSummary();
    log.divider();
    return { ...passage, url: article.url, wordCount: wordCountActual };
  } finally {
    await db.$disconnect();
  }
}

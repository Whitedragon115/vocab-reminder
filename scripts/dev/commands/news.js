import { endSection, printSection } from "../format.js";

export async function cmdNews(args) {
  const { buildNewsContent } = await import("../../../src/services/newsService.js");
  const words = (args[0] ?? "technology, innovation, science")
    .split(",")
    .map((word) => word.trim());

  printSection(`[News] Generating passage for: ${words.join(", ")}`);
  console.log("  Fetching news article...");

  const result = await buildNewsContent(words);

  if (!result) {
    console.log("  No news articles found.");
  } else {
    console.log(`\n  Title    : ${result.Title}`);
    console.log(`  Category : ${result.Category?.join(", ")}`);
    console.log("\n  Passage:\n");
    console.log(result.Passage);
  }

  endSection();
}

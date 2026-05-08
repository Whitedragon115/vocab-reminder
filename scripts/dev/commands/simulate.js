import { bar, endSection, printSection, SECTION_DIVIDER } from "../format.js";
import { weightedSample } from "../utils.js";

function getMilestones() {
  return new Set([1, 5, 10, 20, 30, 50, 100]);
}

function selectWords(vocab, stages, weights, count) {
  const all = vocab.map((entry) => ({ ...entry, stageIndex: stages.get(entry.id) }));
  const stageZero = all.filter((entry) => entry.stageIndex === 0);
  const pool = all.filter((entry) => entry.stageIndex > 0);

  if (stageZero.length >= count) {
    return stageZero.sort(() => Math.random() - 0.5).slice(0, count);
  }

  const selected = [...stageZero];

  if (pool.length > 0) {
    selected.push(...weightedSample(pool, weights, count - stageZero.length));
  }

  return selected;
}

function printDistribution(round, stages, vocabLength) {
  const distribution = {};

  for (const stage of stages.values()) {
    distribution[stage] = (distribution[stage] || 0) + 1;
  }

  const stageKeys = Object.keys(distribution)
    .map(Number)
    .sort((left, right) => left - right);

  console.log(`\n  After round ${round}:`);
  console.log(`    Unseen (stage 0): ${distribution[0] ?? 0} words`);

  for (const stage of stageKeys.filter((value) => value > 0)) {
    const count = distribution[stage];
    console.log(
      `    Stage ${String(stage).padStart(2)}        : ${String(count).padStart(3)} words  ${bar(count, vocabLength)}`,
    );
  }
}

function printStageProbabilities(weights, maxStage) {
  const nonZeroWeightSum = weights.slice(1).reduce((sum, value) => sum + value, 0);

  console.log(`\n${SECTION_DIVIDER}`);
  console.log("  Stage selection probability (when pool has mixed stages):");

  for (let stage = 1; stage <= maxStage; stage += 1) {
    const pct = ((weights[stage] / nonZeroWeightSum) * 100).toFixed(1);
    console.log(
      `    Stage ${String(stage).padStart(2)}: ${pct.padStart(5)}%  ${bar(weights[stage], weights[1])}`,
    );
  }
}

function printHitSummary(vocab, hits) {
  const sortedHits = [...hits.entries()].sort((left, right) => right[1] - left[1]);
  const wordOf = (id) => vocab.find((entry) => entry.id === id)?.word ?? id;

  console.log("\n  Most reviewed (top 5):");
  for (const [id, count] of sortedHits.slice(0, 5)) {
    console.log(`    "${wordOf(id)}" x${count}`);
  }

  console.log("  Least reviewed (bottom 5):");
  for (const [id, count] of sortedHits.slice(-5).reverse()) {
    console.log(`    "${wordOf(id)}" x${count}`);
  }
}

function printCoverageSummary(
  stages,
  firstSeen,
  hits,
  vocabLength,
  initialStageZeroCount,
  perReminder,
) {
  const finalStageZeroCount = [...stages.values()].filter((stage) => stage === 0).length;

  console.log(`\n  Stage-0 words at start : ${initialStageZeroCount}`);

  if (finalStageZeroCount === 0) {
    const lastRound = firstSeen.size > 0 ? Math.max(...firstSeen.values()) : 0;
    console.log(`  All stage-0 words seen by round: ${lastRound}`);
  } else {
    console.log(
      `  Stage-0 words remaining: ${finalStageZeroCount} (est. ${Math.ceil(finalStageZeroCount / perReminder)} more rounds)`,
    );
  }

  console.log(
    `  Unique words selected  : ${[...hits.values()].filter((value) => value > 0).length}/${vocabLength}`,
  );
}

export async function cmdSimulate(args) {
  const rounds = Number.parseInt(args[0], 10) || 30;
  const { createPrismaClient } = await import("../../../src/db.js");
  const { loadConfig } = await import("../../../src/services/configService.js");
  const db = createPrismaClient();

  let vocab;

  try {
    vocab = await db.vocabulary.findMany();
  } finally {
    await db.$disconnect();
  }

  if (vocab.length === 0) {
    console.log("No vocabulary in DB. Run pnpm run sync first.");
    return;
  }

  const config = loadConfig();
  const weights = config.forgettingCurveWeight;
  const perReminder = config.vocabulariesPerReminder ?? 5;
  const maxStage = weights.length - 1;
  const milestones = getMilestones();
  const stages = new Map(vocab.map((entry) => [entry.id, entry.stageIndex]));
  const initialStageZeroCount = [...stages.values()].filter((stage) => stage === 0).length;
  const hits = new Map(vocab.map((entry) => [entry.id, 0]));
  const firstSeen = new Map();

  printSection(`[Simulate] ${vocab.length} words, ${perReminder} per reminder, ${rounds} rounds`);
  console.log(`           Weights: [${weights.slice(1).join(", ")}]`);
  endSection();

  for (let round = 1; round <= rounds; round += 1) {
    const selected = selectWords(vocab, stages, weights, perReminder);

    for (const entry of selected) {
      const currentStage = stages.get(entry.id);
      const nextStage = Math.min(currentStage + 1, maxStage);

      if (currentStage === 0 && !firstSeen.has(entry.id)) {
        firstSeen.set(entry.id, round);
      }

      stages.set(entry.id, nextStage);
      hits.set(entry.id, hits.get(entry.id) + 1);
    }

    if (milestones.has(round) || round === rounds) {
      printDistribution(round, stages, vocab.length);
      console.log(`    Words seen >=1x  : ${firstSeen.size}/${vocab.length}`);
    }
  }

  printStageProbabilities(weights, maxStage);
  printHitSummary(vocab, hits);
  printCoverageSummary(stages, firstSeen, hits, vocab.length, initialStageZeroCount, perReminder);
  endSection();
}

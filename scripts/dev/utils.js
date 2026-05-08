function weightedSample(pool, weights, count) {
  const selected = [];
  const remaining = [...pool];

  for (let i = 0; i < count && remaining.length > 0; i += 1) {
    const total = remaining.reduce((sum, item) => sum + (weights[item.stageIndex] ?? 1), 0);
    let rand = Math.random() * total;

    for (let index = 0; index < remaining.length; index += 1) {
      rand -= weights[remaining[index].stageIndex] ?? 1;
      if (rand <= 0) {
        selected.push(remaining[index]);
        remaining.splice(index, 1);
        break;
      }
    }
  }

  return selected;
}

function parseJsonList(value, fallback = []) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function formatTimestamp(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
  ].join("-");
}

module.exports = { weightedSample, parseJsonList, formatTimestamp };

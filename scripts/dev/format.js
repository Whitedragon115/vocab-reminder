const SECTION_DIVIDER = "-".repeat(41);

function printSection(title) {
  console.log(SECTION_DIVIDER);
  console.log(title);
}

function endSection() {
  console.log(SECTION_DIVIDER);
}

function bar(count, total, width = 20) {
  if (total <= 0) return ".".repeat(width);
  const filled = Math.round((count / total) * width);
  return "#".repeat(filled) + ".".repeat(width - filled);
}

module.exports = { SECTION_DIVIDER, printSection, endSection, bar };

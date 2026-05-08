export const SECTION_DIVIDER = "-".repeat(41);

export function printSection(title) {
  console.log(SECTION_DIVIDER);
  console.log(title);
}

export function endSection() {
  console.log(SECTION_DIVIDER);
}

export function bar(count, total, width = 20) {
  if (total <= 0) {
    return ".".repeat(width);
  }

  const filled = Math.round((count / total) * width);
  return "#".repeat(filled) + ".".repeat(width - filled);
}

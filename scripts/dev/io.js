import readline from "readline";

const lineBuffer = [];
const lineWaiters = [];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.on("line", (line) => {
  const value = line.trim();
  const waiter = lineWaiters.shift();

  if (waiter) {
    waiter(value);
    return;
  }

  lineBuffer.push(value);
});

export function closePrompt() {
  rl.close();
}

export function prompt(question) {
  process.stdout.write(question);

  if (lineBuffer.length > 0) {
    return Promise.resolve(lineBuffer.shift());
  }

  return new Promise((resolve) => lineWaiters.push(resolve));
}

export async function cmdRemind() {
  const { runReminder } = await import("../../../src/scheduler.js");
  const { destroyDmClient } = await import("../../../src/services/discordService.js");

  try {
    await runReminder();
  } finally {
    await destroyDmClient();
  }
}

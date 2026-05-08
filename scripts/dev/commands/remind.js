const { runReminder } = require("../../../src/scheduler");
const { destroyDmClient } = require("../../../src/services/discordService");

async function cmdRemind() {
  try {
    await runReminder();
  } finally {
    await destroyDmClient();
  }
}

module.exports = { cmdRemind };

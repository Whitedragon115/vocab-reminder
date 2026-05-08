const { endSection, printSection } = require("../format");
const { sendReminder, destroyDmClient } = require("../../../src/services/discordService");
const EmbedBuilder = require("../../../src/builders/EmbedBuilder");

async function cmdDiscord() {
  const embed = new EmbedBuilder();
  embed.setTitle("Test Embed");
  embed.setDescription("This is a test message from the dev script. The bot is working correctly!");
  embed.addField("Status", "Connected", true);
  embed.addField("Mode", process.env.MODE ?? "DM", true);
  embed.setColor("#57F287");

  try {
    printSection(`[Discord] Sending test message (mode: ${process.env.MODE ?? "DM"})...`);
    await sendReminder([embed], null);
    console.log("  Sent successfully");
    endSection();
  } finally {
    await destroyDmClient();
  }
}

module.exports = { cmdDiscord };

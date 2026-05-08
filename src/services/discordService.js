const { Client, GatewayIntentBits } = require("discord.js");
const { WebhookClient } = require("../WebhookClient");
const MessageBuilder = require("../builders/MessageBuilder");
const EmbedBuilder = require("../builders/EmbedBuilder");

let dmClient = null;

async function getDmClient() {
  if (dmClient) return dmClient;
  dmClient = new Client({ intents: [GatewayIntentBits.DirectMessages] });
  await dmClient.login(process.env.DISCORD_TOKEN);
  return dmClient;
}

function buildNewsEmbed(newsContent) {
  const embed = new EmbedBuilder();
  embed.setTitle(`📰 ${newsContent.Title}`);
  if (newsContent.url) embed.setUrl(newsContent.url);
  embed.setDescription(newsContent.Passage);
  if (newsContent.Category?.length) embed.addField("Category", newsContent.Category.join(", "), true);
  if (newsContent.wordCount) embed.addField("Word Count", `${newsContent.wordCount} words`, true);
  embed.setColor("#5865F2");
  return embed;
}

async function sendReminder(vocabEmbeds, newsContent) {
  const mode = process.env.MODE ?? "DM";
  if (mode === "DM") await sendDm(vocabEmbeds, newsContent);
  else await sendWebhook(vocabEmbeds, newsContent);
}

async function sendDm(vocabEmbeds, newsContent) {
  const client = await getDmClient();
  const user = await client.users.fetch(process.env.DISCORD_ID);
  const dm = await user.createDM();
  const vocabMessage = await dm.send({ embeds: vocabEmbeds.map((e) => e.toJSON()) });
  if (newsContent) {
    const newsEmbed = buildNewsEmbed(newsContent);
    await vocabMessage.reply({ embeds: [newsEmbed.toJSON()] });
  }
}

async function sendWebhook(vocabEmbeds, newsContent) {
  const webhookClient = new WebhookClient(process.env.DISCORD_WEBHOOK);
  for (const embed of vocabEmbeds) {
    await webhookClient.send(new MessageBuilder().addEmbed(embed));
  }
  if (newsContent) {
    const newsEmbed = buildNewsEmbed(newsContent);
    await webhookClient.send(new MessageBuilder().addEmbed(newsEmbed));
  }
}

async function destroyDmClient() {
  if (dmClient) { await dmClient.destroy(); dmClient = null; }
}

module.exports = { sendReminder, destroyDmClient };

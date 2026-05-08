function requireString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function requireWebhookUrl(url) {
  if (typeof url !== "string" || !url.startsWith("https://discord.com/api/webhooks/")) {
    throw new TypeError("url must be a valid Discord webhook URL");
  }
}

module.exports = { requireString, requireWebhookUrl };

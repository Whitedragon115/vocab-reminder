const axios = require("axios");
const { requireWebhookUrl } = require("./utils/validate");
const MessageBuilder = require("./builders/MessageBuilder");

class WebhookClient {
  constructor(url) {
    requireWebhookUrl(url);
    this.url = url;
  }

  async send(message) {
    const payload = message instanceof MessageBuilder ? message.toJSON() : message;
    const response = await axios.post(this.url, payload, {
      params: { wait: true },
      headers: { "Content-Type": "application/json" },
    });
    return response.data;
  }
}

module.exports = { WebhookClient };

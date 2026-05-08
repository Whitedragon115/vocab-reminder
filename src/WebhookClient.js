import axios from "axios";
import { requireWebhookUrl } from "./utils/validate.js";
import MessageBuilder from "./builders/MessageBuilder.js";

export class WebhookClient {
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

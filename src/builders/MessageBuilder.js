import EmbedBuilder from "./EmbedBuilder.js";

export default class MessageBuilder {
  constructor() {
    this._data = {};
  }

  setContent(content) {
    this._data.content = content;
    return this;
  }

  setUsername(username) {
    this._data.username = username;
    return this;
  }

  setAvatarUrl(url) {
    this._data.avatar_url = url;
    return this;
  }

  addEmbed(embed) {
    if (!this._data.embeds) this._data.embeds = [];
    const payload = embed instanceof EmbedBuilder ? embed.toJSON() : embed;
    this._data.embeds.push(payload);
    return this;
  }

  toJSON() {
    return { ...this._data };
  }
}

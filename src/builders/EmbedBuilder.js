export default class EmbedBuilder {
  constructor() {
    this._data = {};
  }

  setTitle(title) {
    this._data.title = title;
    return this;
  }

  setDescription(description) {
    this._data.description = description;
    return this;
  }

  setColor(color) {
    this._data.color = typeof color === "string" ? parseInt(color.replace("#", ""), 16) : color;
    return this;
  }

  setUrl(url) {
    this._data.url = url;
    return this;
  }

  setTimestamp(date = new Date()) {
    this._data.timestamp = date instanceof Date ? date.toISOString() : date;
    return this;
  }

  setFooter(text, iconUrl) {
    this._data.footer = { text, ...(iconUrl && { icon_url: iconUrl }) };
    return this;
  }

  setThumbnail(url) {
    this._data.thumbnail = { url };
    return this;
  }

  setImage(url) {
    this._data.image = { url };
    return this;
  }

  setAuthor(name, iconUrl, url) {
    this._data.author = {
      name,
      ...(iconUrl && { icon_url: iconUrl }),
      ...(url && { url }),
    };
    return this;
  }

  addField(name, value, inline = false) {
    if (!this._data.fields) this._data.fields = [];
    this._data.fields.push({ name, value, inline });
    return this;
  }

  toJSON() {
    return { ...this._data };
  }
}

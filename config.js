// ============================================================
//  config.js - ALL settings live here. Edit this file only.
// ============================================================

// Convert normal letters to small-caps (used for section labels)
const SMALL = {
  a: "ᴀ", b: "ʙ", c: "ᴄ", d: "ᴅ", e: "ᴇ", f: "ғ", g: "ɢ", h: "ʜ", i: "ɪ",
  j: "ᴊ", k: "ᴋ", l: "ʟ", m: "ᴍ", n: "ɴ", o: "ᴏ", p: "ᴘ", q: "ǫ", r: "ʀ",
  s: "s", t: "ᴛ", u: "ᴜ", v: "ᴠ", w: "ᴡ", x: "x", y: "ʏ", z: "ᴢ",
};
const smallCaps = (text) =>
  String(text).toLowerCase().split("").map((c) => SMALL[c] || c).join("");

module.exports = {
  // ---------- Identity ----------
  BOT_NAME: "Ben 10 MD",
  OWNER_NAME: "WILLYLUPIN",
  OWNER_NUMBER: "254703194573",       // digits only, with country code
  PAIR_NUMBER: "254703194573",        // WhatsApp number to link the bot to
  PREFIX: ".",
  MODE: "PUBLIC",                     // "PUBLIC" or "PRIVATE" (owner only)
  VERSION: "2.0.0",
  TIMEZONE: "Africa/Kenya",
  BOT_IMAGE:
    "https://res.cloudinary.com/dqqyvozdw/image/upload/v1794997798/d7vjsexpwyqjugwuizek.jpg",
  SESSION_DIR: "session",
  HEADER_TITLE: "WILBER",

  // Icons used for each command category in the menu
  CATEGORY_ICONS: {
    General: "🧭",
    Fun: "🎉",
    Tools: "🛠️",
  },

  // ---------- Styling helpers ----------
  smallCaps,

  // Top-of-message header
  header() {
    return (
      "╭─━─━─━─━─━─━─━─━─━─━╮\n" +
      `│  ⚡ ${this.HEADER_TITLE} ⚡\n` +
      "╰─━─━─━─━─━─━─━─━─━─━╯"
    );
  },

  // Section box. rows = array of strings OR [key, value] pairs
  section(icon, label, rows) {
    const body = rows
      .map((r) =>
        Array.isArray(r)
          ? `│ ✦ ${smallCaps(r[0])} : ${r[1]}`
          : `│ ✦ ${r}`
      )
      .join("\n");
    return (
      `┌───〔 ${icon} ${smallCaps(label)} 〕───┐\n` +
      `${body}\n` +
      "└───────────────────┘"
    );
  },
};

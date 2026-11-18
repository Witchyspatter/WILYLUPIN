// ============================================================
//  index.js - Ben 10 MD WhatsApp bot (Baileys, low-RAM build)
// ============================================================
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  Browsers,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");

const config = require("./config");

const SESSION_PATH = path.join(__dirname, config.SESSION_DIR);
const startedAt = Date.now();
let reconnectTimer = null;
let connectedNotified = false;

const log = (...a) => console.log(`[${config.BOT_NAME}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Never exit / never go offline on our own ----------
setInterval(() => {}, 30 * 1000); // keep-alive
process.on("uncaughtException", (e) => log("Uncaught exception:", e));
process.on("unhandledRejection", (e) => log("Unhandled rejection:", e));

// ---------- Helpers ----------
function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${d}d ${h}h ${m}m ${sec}s`;
}
const uptime = () => formatUptime(Date.now() - startedAt);
const digits = (v) => String(v || "").replace(/\D/g, "");
const jidNumber = (jid) => String(jid || "").split("@")[0].split(":")[0];
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Reusable "bot info" section
const infoSection = () =>
  config.section("👑", "bot info", [
    ["owner", config.OWNER_NAME],
    ["prefix", config.PREFIX],
    ["mode", config.MODE],
    ["version", config.VERSION],
    ["status", "Online 🟢"],
    ["uptime", uptime()],
  ]);

// ---------- Local data (no external APIs) ----------
const JOKES = [
  "Why do programmers prefer dark mode? Because light attracts bugs.",
  "I told my computer I needed a break. Now it won't stop sending me Kit-Kat ads.",
  "Why did the developer go broke? He used up all his cache.",
  "There are 10 kinds of people: those who understand binary and those who don't.",
  "A SQL query walks into a bar, walks up to two tables and asks: 'Can I join you?'",
  "Why was the JavaScript developer sad? He didn't know how to 'null' his feelings.",
];
const QUOTES = [
  "The best way to predict the future is to create it. - Peter Drucker",
  "Discipline is choosing between what you want now and what you want most.",
  "Small steps every day lead to big results.",
  "Don't watch the clock; do what it does. Keep going. - Sam Levenson",
  "Success is the sum of small efforts repeated day in and day out.",
  "Dream big. Start small. Act now.",
];

// ============================================================
//  COMMANDS - add a new command by adding one entry here.
//  Each command: { cat, desc, run(ctx) }
//  ctx = { sock, m, jid, args, isOwner, reply }
// ============================================================
const commands = {
  menu: {
    cat: "General",
    desc: "Show this menu",
    async run({ sock, m, jid, reply }) {
      // Build categories automatically from the commands object
      const cats = {};
      for (const [name, cmd] of Object.entries(commands)) {
        (cats[cmd.cat] = cats[cmd.cat] || []).push(
          `${config.PREFIX}${name} - ${cmd.desc}`
        );
      }
      const blocks = Object.entries(cats).map(([cat, rows]) =>
        config.section(config.CATEGORY_ICONS[cat] || "📌", cat, rows)
      );
      const text =
        `${config.header()}\n\n` +
        `${config.BOT_NAME}\n\n` +
        `${infoSection()}\n\n` +
        blocks.join("\n\n");

      try {
        await sock.sendMessage(
          jid,
          { image: { url: config.BOT_IMAGE }, caption: text },
          { quoted: m }
        );
      } catch (e) {
        log("Menu image failed, sending text:", e.message);
        await reply(text); // plain-text fallback
      }
    },
  },

  ping: {
    cat: "General",
    desc: "Check bot speed",
    async run({ reply, m }) {
      const ts = Number(m.messageTimestamp) * 1000 || Date.now();
      const latency = Math.max(0, Date.now() - ts);
      await reply(
        config.section("🏓", "ping", [["speed", `${latency} ms`]])
      );
    },
  },

  alive: {
    cat: "General",
    desc: "Check if the bot is online",
    async run({ reply }) {
      await reply(`${config.header()}\n\n${infoSection()}`);
    },
  },

  owner: {
    cat: "General",
    desc: "Show owner details",
    async run({ reply }) {
      await reply(
        config.section("👤", "owner", [
          ["name", config.OWNER_NAME],
          ["number", `+${config.OWNER_NUMBER}`],
          ["chat", `https://wa.me/${config.OWNER_NUMBER}`],
        ])
      );
    },
  },

  runtime: {
    cat: "General",
    desc: "Show bot uptime",
    async run({ reply }) {
      await reply(config.section("⏱️", "runtime", [["uptime", uptime()]]));
    },
  },

  joke: {
    cat: "Fun",
    desc: "Get a random jokie",
    async run({ reply }) {
      await reply(config.section("😂", "joke", [pick(JOKES)]));
    },
  },

  quote: {
    cat: "Fun",
    desc: "Get a random quote",
    async run({ reply }) {
      await reply(config.section("💬", "quote", [pick(QUOTES)]));
    },
  },

  time: {
    cat: "Tools",
    desc: "Show current time",
    async run({ reply }) {
      const now = new Date().toLocaleString("en-GB", {
        timeZone: config.TIMEZONE,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      });
      await reply(
        config.section("🕒", "time", [
          ["zone", config.TIMEZONE],
          ["now", now],
        ])
      );
    },
  },
};

// ============================================================
//  PAIRING NUMBER RESOLUTION
// ============================================================
// Order: config.PAIR_NUMBER -> PAIR_NUMBER env -> readline prompt (retry loop)
async function resolvePairNumber() {
  const fromConfig = digits(config.PAIR_NUMBER) || digits(process.env.PAIR_NUMBER);
  if (fromConfig.length >= 7) return fromConfig;

  while (true) {
    const answer = await new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const timer = setTimeout(() => {
        rl.close();
        resolve("");
      }, 20000);
      rl.on("close", () => {
        clearTimeout(timer);
        resolve("");
      });
      rl.question("Enter WhatsApp number with country code (e.g. 2547XXXXXXXX): ", (a) => {
        clearTimeout(timer);
        resolve(a);
        rl.close();
      });
    });
    const n = digits(answer);
    if (n.length >= 7) return n;
    log("No number received. Set PAIR_NUMBER in config.js. Retrying in 15 seconds...");
    await sleep(15000);
  }
}

// ============================================================
//  CONNECTION
// ============================================================
function scheduleStart(ms) {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    start().catch((e) => {
      log("Start failed:", e.message);
      scheduleStart(5000);
    });
  }, ms);
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_PATH);

  // Ask for the number BEFORE opening the socket (only if not paired yet)
  let pairNumber = null;
  if (!state.creds.registered) {
    pairNumber = await resolvePairNumber();
  }

  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (e) {
    log("Could not fetch latest WA version, using default.");
  }

  const sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: "silent" }),
    printQRInTerminal: false,
    browser: Browsers.ubuntu("Chrome"),
    syncFullHistory: false,
    markOnlineOnConnect: false,
    generateHighQualityLinkPreview: false,
    shouldIgnoreJid: (jid) =>
      jid === "status@broadcast" || String(jid).endsWith("@newsletter"),
    getMessage: async () => undefined, // no message store (saves RAM)
  });

  sock.ev.on("creds.update", saveCreds);

  // Request the pairing code ~3 seconds after the socket is created
  if (pairNumber) {
    setTimeout(async () => {
      try {
        if (state.creds.registered) return;
        const raw = await sock.requestPairingCode(pairNumber);
        const code = String(raw).match(/.{1,4}/g).join("-");
        console.log("\n==================================================");
        console.log(`  PAIRING CODE:  ${code}`);
        console.log("==================================================");
        console.log("  1. Open WhatsApp on your phone");
        console.log("  2. Go to Settings > Linked Devices > Link a Device");
        console.log("  3. Tap 'Link with phone number instead'");
        console.log(`  4. Enter the code ${code}\n`);
      } catch (e) {
        log("Pairing code request failed, retrying:", e.message);
        try {
          sock.end(new Error("pairing failed")); // triggers reconnect
        } catch (_) {}
      }
    }, 3000);
  }

  // ----- Connection lifecycle -----
  sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
    if (connection === "open") {
      log("Connected as", jidNumber(sock.user && sock.user.id));
      if (!connectedNotified) {
        connectedNotified = true;
        try {
          const ownJid = `${jidNumber(sock.user.id)}@s.whatsapp.net`;
          await sock.sendMessage(ownJid, {
            text: config.section("✅", "connected", [
              ["bot", config.BOT_NAME],
              ["mode", config.MODE],
              ["prefix", config.PREFIX],
            ]),
          });
        } catch (e) {
          log("Could not send startup message:", e.message);
        }
      }
    }

    if (connection === "close") {
      const code =
        lastDisconnect &&
        lastDisconnect.error &&
        lastDisconnect.error.output &&
        lastDisconnect.error.output.statusCode;
      log("Connection closed. Code:", code);

      if (code === DisconnectReason.loggedOut) {
        // Logged out: wipe session and pair again
        log("Logged out. Deleting session and pairing again...");
        fs.rmSync(SESSION_PATH, { recursive: true, force: true });
        connectedNotified = false;
        scheduleStart(3000);
      } else if (code === 515) {
        scheduleStart(500); // restart required: reconnect almost immediately
      } else {
        scheduleStart(4000);
      }
    }
  });

  // ----- Incoming messages -----
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const m of messages) {
      try {
        await handleMessage(sock, m);
      } catch (e) {
        log("Message handler error:", e.message);
      }
    }
  });
}

// ============================================================
//  MESSAGE HANDLER
// ============================================================
async function handleMessage(sock, m) {
  if (!m.message || !m.key) return;
  const jid = m.key.remoteJid;
  if (!jid || jid === "status@broadcast" || jid.endsWith("@newsletter")) return;

  // Unwrap disappearing-message wrapper
  let msg = m.message;
  if (msg.ephemeralMessage && msg.ephemeralMessage.message) {
    msg = msg.ephemeralMessage.message;
  }
  const body =
    msg.conversation ||
    (msg.extendedTextMessage && msg.extendedTextMessage.text) ||
    (msg.imageMessage && msg.imageMessage.caption) ||
    (msg.videoMessage && msg.videoMessage.caption) ||
    "";
  const text = body.trim();
  if (!text.startsWith(config.PREFIX)) return;

  // Work out who sent it and whether they are the owner
  const sender = jidNumber(m.key.participant || jid);
  const altSender = jidNumber(m.key.participantPn || m.key.senderPn || "");
  const isOwner =
    m.key.fromMe ||
    sender === config.OWNER_NUMBER ||
    altSender === config.OWNER_NUMBER;

  // Respect MODE
  if (config.MODE.toUpperCase() === "PRIVATE" && !isOwner) return;

  const parts = text.slice(config.PREFIX.length).trim().split(/\s+/);
  const name = (parts.shift() || "").toLowerCase();
  const cmd = commands[name];
  if (!cmd) return;

  const reply = (t) => sock.sendMessage(jid, { text: t }, { quoted: m });
  await cmd.run({ sock, m, jid, args: parts, isOwner, reply });
}

// ---------- Boot ----------
log(`Starting ${config.BOT_NAME} v${config.VERSION} (${config.MODE})...`);
start().catch((e) => {
  log("Fatal start error:", e.message);
  scheduleStart(5000);
});

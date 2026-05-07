/**
 * AutoGuard Chat — WhatsApp Bridge Server
 *
 * SETUP (run once from your project root):
 *   npm install whatsapp-web.js qrcode express cors axios dotenv
 *
 * RUN (from project root in a separate terminal):
 *   node server/whatsapp-server.js
 */

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { readFileSync, existsSync } from "fs";

// ── Load .env.local manually ─────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = resolve(__dirname, "../.env.local");

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const val = trimmed.slice(eqIndex + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
  console.log("[env] Loaded .env.local ✓");
} else {
  console.warn("[env] .env.local not found — using system environment variables");
}

const require = createRequire(import.meta.url);

const { Client, LocalAuth } = require("whatsapp-web.js");
const qrcode = require("qrcode");
const express = require("express");
const cors = require("cors");
const axios = require("axios");

// ── CONFIG ────────────────────────────────────────────────────────────────────
const CONVEX_SITE_URL = process.env.CONVEX_SITE_URL || process.env.VITE_CONVEX_URL;
if (!CONVEX_SITE_URL) {
  console.error("\n❌  VITE_CONVEX_URL is not set in .env.local");
  process.exit(1);
}
const CONVEX_HTTP_URL = CONVEX_SITE_URL.replace(".convex.cloud", ".convex.site");
const PORT = process.env.BRIDGE_PORT || 3001;
console.log(`[config] Convex HTTP actions URL: ${CONVEX_HTTP_URL}`);

// ── STATE ────────────────────────────────────────────────────────────────────
let waClient = null;
let currentQRBase64 = null;
let currentSessionId = null;
let connectionStatus = "disconnected";

// Contact cache — refreshed every 60 seconds
let cachedContacts = [];
let contactsCachedAt = 0;

const app = express();
app.use(cors());
app.use(express.json());

// ── HELPER: POST to Convex HTTP action ────────────────────────────────────────
async function convexPost(endpoint, body) {
  const url = `${CONVEX_HTTP_URL}/api/${endpoint}`;
  try {
    const res = await axios.post(url, body, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });
    console.log(`[Convex] POST /${endpoint} → ${res.status} ✓`);
    return res.data;
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error(`[Convex] POST /${endpoint} failed: ${status} — ${JSON.stringify(data) || err.message}`);
    console.error(`[Convex] URL was: ${url}`);
  }
}

// ── HELPER: Strip emojis + special chars, keep letters/numbers/spaces ─────────
function cleanName(name) {
  return (name || "")
    .replace(/[\u{1F600}-\u{1F64F}]/gu, "")
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, "")
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, "")
    .replace(/[\u{1F700}-\u{1F77F}]/gu, "")
    .replace(/[\u{1F780}-\u{1F7FF}]/gu, "")
    .replace(/[\u{1F800}-\u{1F8FF}]/gu, "")
    .replace(/[\u{1F900}-\u{1F9FF}]/gu, "")
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, "")
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, "")
    .replace(/[\u{2600}-\u{26FF}]/gu, "")
    .replace(/[\u{2700}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{1F1E0}-\u{1F1FF}]/gu, "")
    .replace(/[~*_\-.,!?@#$%^&()[\]{}<>|\\/"';:`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// ── HELPER: Fuzzy name match score (0-1) ─────────────────────────────────────
function matchScore(searchName, contactName) {
  const search = cleanName(searchName);
  const contact = cleanName(contactName);

  if (!search || !contact) return 0;
  if (contact === search) return 1.0;
  if (contact.includes(search)) return 0.9;
  if (search.includes(contact)) return 0.85;

  const searchWords = search.split(" ").filter(w => w.length >= 2);
  const contactWords = contact.split(" ").filter(w => w.length >= 2);

  let wordMatches = 0;
  for (const sw of searchWords) {
    for (const cw of contactWords) {
      if (cw === sw || cw.includes(sw) || sw.includes(cw)) {
        wordMatches++;
        break;
      }
    }
  }

  if (searchWords.length > 0 && wordMatches > 0) {
    return (wordMatches / Math.max(searchWords.length, contactWords.length)) * 0.8;
  }

  return 0;
}

// ── HELPER: Get all contacts with caching ─────────────────────────────────────
async function getAllContacts() {
  const now = Date.now();
  if (cachedContacts.length > 0 && now - contactsCachedAt < 60000) {
    return cachedContacts;
  }

  try {
    const all = await waClient.getContacts();
    // Include ALL individual contacts — including yourself (isMe)
    cachedContacts = all.filter(c =>
      c.id?.server === "c.us" &&
      c.id?.user &&
      (c.name || c.pushname || c.shortName || c.verifiedName)
    );
    contactsCachedAt = now;
    console.log(`[contacts] Cached ${cachedContacts.length} contacts (including self)`);
    return cachedContacts;
  } catch (err) {
    console.error("[contacts] Failed to load:", err.message);
    return [];
  }
}

// ── HELPER: Find chatId from phone number or contact name ─────────────────────
// Returns { chatId, phone } — phone is the raw digits for whatsapp:// deep link
async function resolveChatId(to, contactName) {
  const searchInput = (contactName || to || "").trim();
  console.log(`\n[resolve] Looking for: "${searchInput}"`);

  // 1. Already a WhatsApp ID
  if (searchInput.includes("@c.us")) {
    const phone = searchInput.replace("@c.us", "");
    return { chatId: searchInput, phone };
  }

  // 2. Looks like a phone number — use directly
  const digitsOnly = searchInput.replace(/\D/g, "");
  if (digitsOnly.length >= 7 && /^\+?[\d\s\-(). ]+$/.test(searchInput)) {
    const chatId = `${digitsOnly}@c.us`;
    console.log(`[resolve] Phone → ${chatId}`);
    return { chatId, phone: digitsOnly };
  }

  // 3. Search by name in WhatsApp contacts (fuzzy, emoji-stripped)
  if (waClient && connectionStatus === "connected") {
    const contacts = await getAllContacts();
    const cleaned = cleanName(searchInput);
    console.log(`[resolve] Searching "${cleaned}" in ${contacts.length} contacts`);

    let bestMatch = null;
    let bestScore = 0;

    for (const c of contacts) {
      const namesToTry = [c.pushname, c.name, c.shortName, c.verifiedName].filter(Boolean);
      for (const nameField of namesToTry) {
        const score = matchScore(searchInput, nameField);
        if (score > bestScore) {
          bestScore = score;
          bestMatch = c;
        }
      }
    }

    // Log top matches for debugging
    const topMatches = contacts
      .map(c => {
        const names = [c.pushname, c.name, c.shortName, c.verifiedName].filter(Boolean);
        const best = Math.max(...names.map(n => matchScore(searchInput, n)));
        return { name: names[0], score: best, id: c.id._serialized };
      })
      .filter(m => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
    console.log("[resolve] Top matches:", JSON.stringify(topMatches));

    if (bestMatch && bestScore >= 0.5) {
      const chatId = bestMatch.id._serialized;
      const phone = bestMatch.id.user; // raw digits e.g. "919489979969"
      console.log(`[resolve] ✓ Matched → ${chatId} (score: ${bestScore.toFixed(2)})`);
      return { chatId, phone };
    }

    console.log(`[resolve] ✗ No match (best: ${bestScore.toFixed(2)})`);
  }

  // 4. Fallback: use digits as phone
  if (digitsOnly.length >= 7) {
    console.log(`[resolve] Fallback phone → ${digitsOnly}@c.us`);
    return { chatId: `${digitsOnly}@c.us`, phone: digitsOnly };
  }

  return null;
}

// ── START WhatsApp client ─────────────────────────────────────────────────────
function startWhatsAppClient(sessionId) {
  if (waClient) {
    waClient.destroy().catch(() => {});
    waClient = null;
  }

  currentSessionId = sessionId;
  connectionStatus = "starting";
  currentQRBase64 = null;
  cachedContacts = [];
  contactsCachedAt = 0;

  console.log(`\n[WA] Initialising client for session: ${sessionId}`);

  waClient = new Client({
    authStrategy: new LocalAuth({ clientId: sessionId }),
    puppeteer: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--window-size=1280,800",
      ],
    },
  });

  waClient.on("qr", async (qr) => {
    console.log("[WA] QR received — converting to image…");
    connectionStatus = "qr_ready";
    try {
      currentQRBase64 = await qrcode.toDataURL(qr, { width: 300, margin: 2 });
      await convexPost("updateQR", { sessionId, qrCode: currentQRBase64 });
      console.log("[WA] QR pushed to Convex ✓");
    } catch (err) {
      console.error("[WA] QR encode error:", err.message);
    }
  });

  waClient.on("authenticated", () => {
    console.log("[WA] Authenticated ✓");
    connectionStatus = "connecting";
  });

  waClient.on("ready", async () => {
    console.log("[WA] Client ready ✓");
    connectionStatus = "connected";
    currentQRBase64 = null;

    const info = waClient.info;
    const phoneNumber = `+${info.wid.user}`;
    const displayName = info.pushname || info.wid.user;

    console.log(`[WA] Connected as ${displayName} (${phoneNumber})`);
    await convexPost("whatsappConnected", { sessionId, phoneNumber, displayName });

    // Pre-warm contact cache immediately
    await getAllContacts();
  });

  waClient.on("message", async (msg) => {
    if (msg.fromMe) return;
    const body = msg.body || "";
    const from = msg.from;
    const contactName = msg._data?.notifyName || from;
    console.log(`[WA] ← ${contactName}: ${body}`);
    await convexPost("incomingMessage", { sessionId, from, contactName, body, timestamp: Date.now() });
  });

  waClient.on("disconnected", async (reason) => {
    console.log("[WA] Disconnected:", reason);
    connectionStatus = "disconnected";
    currentQRBase64 = null;
    cachedContacts = [];
    await convexPost("whatsappDisconnected", { sessionId });
  });

  waClient.initialize().catch((err) => {
    console.error("[WA] Init error:", err.message);
    connectionStatus = "disconnected";
  });
}

// ── REST ENDPOINTS ────────────────────────────────────────────────────────────

app.post("/start-session", (req, res) => {
  const { sessionId } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId required" });
  console.log("[API] /start-session →", sessionId);
  startWhatsAppClient(sessionId);
  res.json({ success: true, status: "starting" });
});

app.get("/qr", (req, res) => {
  if (!currentQRBase64) {
    return res.status(404).json({ error: "QR not ready yet", status: connectionStatus });
  }
  res.json({ qr: currentQRBase64, status: connectionStatus });
});

app.get("/status", (req, res) => {
  res.json({ status: connectionStatus, sessionId: currentSessionId });
});

// ── Debug: list all contacts ──────────────────────────────────────────────────
app.get("/contacts", async (req, res) => {
  if (!waClient || connectionStatus !== "connected") {
    return res.status(503).json({ error: "Not connected" });
  }
  const contacts = await getAllContacts();
  const list = contacts.map(c => ({
    pushname: c.pushname,
    name: c.name,
    cleanedName: cleanName(c.pushname || c.name || ""),
    phone: c.id.user,
    id: c.id._serialized,
  }));
  res.json({ count: list.length, contacts: list });
});

// ── Send message — returns sentTo (chatId) and phone for desktop deep link ────
app.post("/send-message", async (req, res) => {
  const { to, message, contactName } = req.body;
  console.log(`\n[API] /send-message to="${to}" contactName="${contactName}" message="${message}"`);

  if (!waClient || connectionStatus !== "connected") {
    return res.status(503).json({ error: "WhatsApp not connected. Scan QR first." });
  }

  if (!message) {
    return res.status(400).json({ error: "message is required" });
  }

  try {
    const resolved = await resolveChatId(to, contactName);

    if (!resolved) {
      return res.status(404).json({
        error: `Could not find "${contactName || to}" in your WhatsApp contacts.`,
      });
    }

    const { chatId, phone } = resolved;
    await waClient.sendMessage(chatId, message);
    console.log(`[API] ✓ Sent to ${chatId}: "${message}"`);

    // Return sentTo AND phone so frontend can open WhatsApp desktop to that chat
    res.json({ success: true, sentTo: chatId, phone });
  } catch (err) {
    console.error("[API] Send error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post("/disconnect", async (req, res) => {
  console.log("[API] /disconnect");
  if (waClient) {
    await waClient.logout().catch(() => {});
    await waClient.destroy().catch(() => {});
    waClient = null;
  }
  connectionStatus = "disconnected";
  currentQRBase64 = null;
  cachedContacts = [];
  res.json({ success: true });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, status: connectionStatus, convexUrl: CONVEX_HTTP_URL });
});

// ── START ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛡️  AutoGuard WhatsApp Bridge`);
  console.log(`   Listening : http://localhost:${PORT}`);
  console.log(`   Convex    : ${CONVEX_HTTP_URL}`);
  console.log(`\n   Waiting for /start-session from the UI…\n`);
});
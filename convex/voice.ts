import { query, action, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// MULTILINGUAL VOICE COMMAND PARSER — No AI API needed
// Supports: English, Tamil (Unicode), Hindi, Malayalam (Unicode), Tanglish
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedCommand {
  action: string;
  contact: string;
  phone: string;
  message: string;
  details: string;
  response: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function clean(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function findContact(name: string, contacts: any[]): any | null {
  if (!name || !contacts.length) return null;
  const nl = name.toLowerCase().trim();
  return (
    contacts.find((c: any) => c.displayName.toLowerCase() === nl) ||
    contacts.find((c: any) =>
      c.displayName.toLowerCase().includes(nl) ||
      nl.includes(c.displayName.toLowerCase())
    ) ||
    null
  );
}

function makeSendResult(
  contactRaw: string,
  message: string,
  language: string,
  contacts: any[]
): ParsedCommand {
  const saved = findContact(contactRaw, contacts);
  const contact = saved?.displayName || contactRaw;
  const phone = saved?.phoneNumber || "";
  return {
    action: "send_message",
    contact,
    phone,
    message,
    details: "",
    response: makeResponse("send_message", contact, message, language),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TAMIL UNICODE PARSER
// Voice recognition (ta-IN) returns Tamil Unicode script
// Handles: "சிந்துக்கு ஹாய் அனுப்பு", "மோனா கிட்ட நான் லேட் சொல்லு" etc.
// ─────────────────────────────────────────────────────────────────────────────
const TAMIL_SUFFIXES = ["க்கு", "கிட்ட", "கிட்டே", "விடம்", "யிடம்", "ஐ"];
const TAMIL_SEND_VERBS = [
  "அனுப்பு", "அனுப்புங்க", "சொல்லு", "சொல்லுங்க",
  "தெரிவி", "தெரிவிக்க", "கொடு", "பேசு",
];
const TAMIL_ASK_VERBS = ["கேளு", "கேட்கணும்", "கேள்"];

function parseTamilUnicode(cmd: string, language: string, contacts: any[]): ParsedCommand | null {
  for (const suffix of TAMIL_SUFFIXES) {
    const idx = cmd.indexOf(suffix);
    if (idx <= 0) continue;

    // ✅ Word boundary check: suffix must be preceded by a non-space char
    // (it's attached to the contact name, e.g. "சிந்து" + "க்கு")
    // AND must be followed by a space (so it's not in the middle of a word)
    const afterIdx = idx + suffix.length;
    if (afterIdx < cmd.length && cmd[afterIdx] !== " ") continue;

    const contactPart = clean(cmd.slice(0, idx));
    let rest = clean(cmd.slice(afterIdx));

    if (!contactPart || !rest) continue;

    // Question verbs
    for (const verb of TAMIL_ASK_VERBS) {
      if (rest.endsWith(verb)) {
        const question = clean(rest.slice(0, rest.length - verb.length));
        return makeSendResult(contactPart, question || rest, language, contacts);
      }
    }

    // Remove trailing send verb
    for (const verb of TAMIL_SEND_VERBS) {
      if (rest.endsWith(verb)) {
        rest = clean(rest.slice(0, rest.length - verb.length));
        break;
      }
    }

    if (contactPart && rest) {
      return makeSendResult(contactPart, rest, language, contacts);
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// MALAYALAM UNICODE PARSER
// ✅ KEY FIX: suffix must appear at a WORD BOUNDARY — preceded by a space
// or start of string AND followed by a space.
// This prevents "ക്കൂ" inside "അയക്കൂ" (the send verb) from being matched.
//
// Example: "sindhu ku hello അയക്കൂ"
//   ❌ OLD: finds "ക്കൂ" at position 21 (inside "അയക്കൂ") → contact="sindhu ku hello അയ"
//   ✅ NEW: "ക്കൂ" inside "അയക്കൂ" is NOT preceded by a space → skipped
//           No Malayalam suffix found → falls through to regex patterns
//           Regex "(.+?) ku (.+?) അയക്കൂ" matches → contact="sindhu" message="hello"
// ─────────────────────────────────────────────────────────────────────────────
const MALAYALAM_SUFFIXES = ["ക്കു", "ക്ക്", "ക്കൂ", "കിട്ട", "ക്ക"];
const MALAYALAM_SEND_VERBS = ["അയക്കൂ", "അയക്കു", "പറയൂ", "പറ", "കൊടുക്കൂ", "അയക്കണം"];

function parseMalayalamUnicode(cmd: string, language: string, contacts: any[]): ParsedCommand | null {
  for (const suffix of MALAYALAM_SUFFIXES) {
    let searchStart = 0;

    while (searchStart < cmd.length) {
      const idx = cmd.indexOf(suffix, searchStart);
      if (idx <= 0) break;

      const afterIdx = idx + suffix.length;

      // ✅ WORD BOUNDARY CHECK:
      // The suffix must be followed by a SPACE (or end of string)
      // This prevents matching "ക്കൂ" inside "അയക്കൂ"
      const followedBySpace = afterIdx >= cmd.length || cmd[afterIdx] === " ";
      if (!followedBySpace) {
        searchStart = idx + 1;
        continue;
      }

      // Also check: the character BEFORE the suffix must not be a space
      // (suffix must be attached to the contact name word)
      const precededByNonSpace = idx > 0 && cmd[idx - 1] !== " ";
      if (!precededByNonSpace) {
        searchStart = idx + 1;
        continue;
      }

      const contactPart = clean(cmd.slice(0, idx));
      let rest = clean(cmd.slice(afterIdx));

      if (!contactPart || !rest) {
        searchStart = idx + 1;
        continue;
      }

      // Remove trailing send verb
      for (const verb of MALAYALAM_SEND_VERBS) {
        if (rest.endsWith(verb)) {
          rest = clean(rest.slice(0, rest.length - verb.length));
          break;
        }
      }

      if (contactPart && rest) {
        return makeSendResult(contactPart, rest, language, contacts);
      }

      searchStart = idx + 1;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// SEND MESSAGE REGEX PATTERNS
// cg = capture group index for contact name
// mg = capture group index for message text
// ─────────────────────────────────────────────────────────────────────────────
const SEND_PATTERNS: Array<{ regex: RegExp; cg: number; mg: number }> = [

  // ── ENGLISH ──────────────────────────────────────────────────────────────
  { regex: /^send\s+(.+?)\s+to\s+(.+)$/i, cg: 2, mg: 1 },
  { regex: /^send\s+(?:a\s+)?message\s+to\s+(.+?)\s+saying\s+(.+)$/i, cg: 1, mg: 2 },
  { regex: /^send\s+(?:a\s+)?message\s+to\s+(.+?)\s+that\s+(.+)$/i, cg: 1, mg: 2 },
  { regex: /^send\s+(?:a\s+)?message\s+to\s+(.+?)[,:\s]+(.+)$/i, cg: 1, mg: 2 },
  { regex: /^message\s+(.+?)\s+(?:saying|that|:)\s+(.+)$/i, cg: 1, mg: 2 },
  { regex: /^tell\s+(.+?)\s+(?:that\s+)?i\s+(?:am\s+|will\s+)?(.+)$/i, cg: 1, mg: 2 },
  { regex: /^tell\s+(.+?)\s+(?:that\s+)?(.+)$/i, cg: 1, mg: 2 },
  { regex: /^text\s+(.+?)\s+(?:saying|that)?\s+(.+)$/i, cg: 1, mg: 2 },
  { regex: /^chat\s+(.+?)\s+that\s+(.+)$/i, cg: 1, mg: 2 },
  { regex: /^say\s+(.+?)\s+to\s+(.+)$/i, cg: 2, mg: 1 },
  { regex: /^write\s+(?:to\s+)?(.+?)\s+(?:that|saying)?\s+(.+)$/i, cg: 1, mg: 2 },
  { regex: /^(?:inform|notify|ping)\s+(.+?)\s+(?:that\s+)?(.+)$/i, cg: 1, mg: 2 },

  // ── TANGLISH ─────────────────────────────────────────────────────────────
  { regex: /^(.+?)\s+ku\s+(.+?)\s+anuppu$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+ku\s+(.+?)\s+sollu$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+ku\s+(.+?)\s+nu\s+sollu$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+ku\s+(.+?)\s+nu$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+(?:ku|kku)\s+(.+?)\s+(?:nnu\s+)?solliru$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+ku\s+message\s+send\s+pannu\s+(.+?)\s*(?:nu)?$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+(?:kita|kitta)\s+(.+?)\s+(?:sollu|kelu|anuppu|solliru)$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+ku\s+sollu\s+(.+)$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+(?:nnu|nu)\s+(.+?)\s+(?:kita|kitta)\s+solliru$/i, cg: 2, mg: 1 },
  { regex: /^(.+?)\s+(?:nnu|nu)\s+(.+?)\s+ku\s+sollu$/i, cg: 2, mg: 1 },
  { regex: /^(.+?)\s+(?:kita|kitta)\s+(.+?)\s+(?:nnu\s+)?kelu$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+ku\s+(?:send\s+pannu|anuppu)\s+(.+)$/i, cg: 1, mg: 2 },

  // ── TAMIL UNICODE regex fallback ──────────────────────────────────────────
  { regex: /^(.+?)\s*க்கு\s+(.+?)\s+(?:அனுப்பு|சொல்லு|தெரிவி|பேசு)(?:\s+\S+)?$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s*கிட்ட\s+(.+?)\s+(?:சொல்லு|அனுப்பு|கேளு)$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s*விடம்\s+(.+?)\s+(?:சொல்லு|தெரிவி)$/i, cg: 1, mg: 2 },

  // ── HINDI ────────────────────────────────────────────────────────────────
  { regex: /^(.+?)\s+ko\s+(.+?)\s+(?:bhejo|bhejna|bejo|de\s+do|bhej\s+do|bej\s+do|bejdo)$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+ko\s+(?:bol|bolo|batao|bata|bol\s+do|bata\s+do)\s+(?:ki\s+|ke\s+|na\s+|yaar\s+)?(.+)$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+ko\s+(?:message|msg)\s+(?:karo|kar|bhejo|de)\s+(.+)$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+को\s+(.+?)\s+(?:भेजो|बोलो|बताओ|भेज\s+दो|बता\s+दो)$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+(?:sindhu|[\u0900-\u097F]{2,})\s+ko\s+(?:bol|bolo|batao)$/i, cg: 2, mg: 1 },
  { regex: /^(.+?)\s+ko\s+(.+)$/i, cg: 1, mg: 2 },

  // ── MALAYALAM UNICODE + MIXED ─────────────────────────────────────────────
  // Pure Malayalam script patterns
  { regex: /^(.+?)\s*ക്കു?\s+(.+?)\s+(?:അയക്കൂ|അയക്കു|പറയൂ)$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s*കിട്ട\s+(.+?)\s+(?:പറയൂ|അയക്കൂ|പറ)$/i, cg: 1, mg: 2 },
  // ✅ Mixed script: "Sindhu ku hello അയക്കൂ" — this is the main fix pattern
  // The Malayalam unicode parser was wrongly matching "ക്കൂ" inside "അയക്കൂ"
  // Now it falls through to these regex patterns which correctly split contact/message
  { regex: /^(.+?)\s+(?:ku|kku)\s+(.+?)\s+(?:അയക്കൂ|അയക്കു|പറയൂ)$/i, cg: 1, mg: 2 },
  { regex: /^(.+?)\s+ku\s+(.+?)\s+(?:ayakkoo|ayakku|parayoo)$/i, cg: 1, mg: 2 },
];

// ── OPEN CHAT PATTERNS ────────────────────────────────────────────────────────
const OPEN_CHAT_PATTERNS: RegExp[] = [
  /^open\s+(?:chat\s+(?:with\s+)?)?(.+)$/i,
  /^chat\s+with\s+(.+)$/i,
  /^(.+?)\s+chat\s+(?:thirappu|open\s+pannu|thirakku|open|thirakkirein)$/i,
  /^(.+?)\s+(?:ka\s+)?chat\s+(?:kholo|open\s+karo|khol\s+do)$/i,
  /^(.+?)\s+chat\s+(?:തുറക്കൂ|thirakku)$/i,
  /^(.+?)\s+(?:kita|kitta)\s+chat\s+(?:pannu|open)$/i,
];

// ── LOCATION PATTERNS ─────────────────────────────────────────────────────────
const LOCATION_PATTERNS: RegExp[] = [
  /share\s+(?:my\s+)?location/i,
  /location\s+share/i,
  /send\s+(?:my\s+)?location/i,
  /en\s+location\s+share\s+pannu/i,
  /(?:en\s+)?location\s+(?:share\s+)?(?:karo|pannu|cheyyoo|cheyyu|anuppu)/i,
  /mera\s+location\s+(?:bhejo|share\s+karo)/i,
  /location\s+(?:அனுப்பு|അയക്കൂ)/i,
];

// ── REMINDER PATTERNS ─────────────────────────────────────────────────────────
const REMINDER_PATTERNS: Array<{ regex: RegExp; group: number }> = [
  { regex: /^set\s+(?:a\s+)?reminder\s+(?:for\s+)?(.+)$/i, group: 1 },
  { regex: /^remind\s+me\s+(?:to\s+|about\s+)?(.+)$/i, group: 1 },
  { regex: /^(.+)\s+reminder\s+(?:vei|set\s+pannu|vaikku|lagao)$/i, group: 1 },
  { regex: /^naalai\s+(.+)\s+reminder$/i, group: 1 },
  { regex: /^kal\s+(.+?)\s+(?:reminder|yaad\s+dilao)(?:\s+lagao)?$/i, group: 1 },
  { regex: /^याद\s+(?:दिलाओ|करो)\s+(.+)$/i, group: 1 },
  { regex: /^(.+)\s+(?:reminder\s+வை|நினைவு\s+வை)$/i, group: 1 },
];

// ── Response generator ────────────────────────────────────────────────────────
function makeResponse(action: string, contact: string, message: string, lang: string): string {
  if (action === "send_message") {
    const r: Record<string, string> = {
      en: `Sending '${message}' to ${contact}!`,
      ta: `${contact}க்கு '${message}' அனுப்புகிறேன்!`,
      hi: `${contact} को '${message}' भेज रहा हूं!`,
      ml: `${contact}ക്ക് '${message}' അയക്കുന്നു!`,
      tanglish: `${contact} ku '${message}' anuppukirein!`,
    };
    return r[lang] || r.en;
  }
  if (action === "open_chat") {
    const r: Record<string, string> = {
      en: `Opening chat with ${contact}!`,
      ta: `${contact} chat திறக்கிறேன்!`,
      hi: `${contact} का chat खोल रहा हूं!`,
      ml: `${contact} chat തുറക്കുന്നു!`,
      tanglish: `${contact} chat thirakkirein!`,
    };
    return r[lang] || r.en;
  }
  if (action === "share_location") {
    const r: Record<string, string> = {
      en: "Sharing your location!",
      ta: "உங்கள் location share செய்கிறேன்!",
      hi: "Location share कर रहा हूं!",
      ml: "Location share ചെയ്യുന്നു!",
      tanglish: "Location share pannukirein!",
    };
    return r[lang] || r.en;
  }
  if (action === "set_reminder") {
    const r: Record<string, string> = {
      en: `Reminder set: ${contact || message}!`,
      ta: `Reminder வைக்கிறேன்: ${contact || message}!`,
      hi: `Reminder set किया: ${contact || message}!`,
      ml: `Reminder വെക്കുന്നു: ${contact || message}!`,
      tanglish: `Reminder vaikkirein: ${contact || message}!`,
    };
    return r[lang] || r.en;
  }
  const r: Record<string, string> = {
    en: "Not understood. Say: 'Send [message] to [name]' or 'Message [name] that [message]'",
    ta: "புரியவில்லை. சொல்லுங்கள்: '[பெயர்]க்கு [message] அனுப்பு'",
    hi: "समझ नहीं आया। बोलें: '[नाम] को [message] भेजो'",
    ml: "മനസ്സിലായില്ല. പറയൂ: '[name]ക്ക് [message] അയക്കൂ'",
    tanglish: "Puriyala. Sollu: '[peyar] ku [message] anuppu'",
  };
  return r[lang] || r.en;
}

// ── Main parser ───────────────────────────────────────────────────────────────
function parseCommand(command: string, language: string, contacts: any[]): ParsedCommand {
  const cmd = command.trim();

  // Step 1: Unicode-aware parsers for voice recognition output
  if (language === "ta" || language === "tanglish") {
    const result = parseTamilUnicode(cmd, language, contacts);
    if (result) return result;
  }
  if (language === "ml") {
    const result = parseMalayalamUnicode(cmd, language, contacts);
    if (result) return result;
  }

  // Step 2: Regex patterns for all languages
  for (const { regex, cg, mg } of SEND_PATTERNS) {
    const m = cmd.match(regex);
    if (m) {
      const contact = clean(m[cg] || "");
      const message = clean(m[mg] || "");
      // Sanity check: contact shouldn't be too long (likely a parsing error)
      if (contact && message && contact.length < 60) {
        return makeSendResult(contact, message, language, contacts);
      }
    }
  }

  // Step 3: Location
  for (const pattern of LOCATION_PATTERNS) {
    if (pattern.test(cmd)) {
      return {
        action: "share_location",
        contact: "", phone: "", message: "", details: "",
        response: makeResponse("share_location", "", "", language),
      };
    }
  }

  // Step 4: Open chat
  for (const pattern of OPEN_CHAT_PATTERNS) {
    const m = cmd.match(pattern);
    if (m) {
      const contact = clean(m[1] || "");
      if (contact) {
        return {
          action: "open_chat",
          contact, phone: "", message: "", details: "",
          response: makeResponse("open_chat", contact, "", language),
        };
      }
    }
  }

  // Step 5: Reminder
  for (const { regex, group } of REMINDER_PATTERNS) {
    const m = cmd.match(regex);
    if (m) {
      const text = clean(m[group] || cmd);
      return {
        action: "set_reminder",
        contact: text, phone: "", message: text, details: "",
        response: makeResponse("set_reminder", text, "", language),
      };
    }
  }

  // Step 6: Unknown
  return {
    action: "unknown",
    contact: "", phone: "", message: "", details: "",
    response: makeResponse("unknown", "", "", language),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVEX EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export const processVoiceCommand = action({
  args: { command: v.string(), language: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const contacts = await ctx.runQuery(internal.voice.getUserContacts, { userId });
    const parsed = parseCommand(args.command, args.language, contacts as any[]);
    await ctx.runMutation(internal.voice.logVoiceCommand, {
      userId,
      command: args.command,
      language: args.language,
      action: parsed.action,
      status: parsed.action !== "unknown" ? "success" : "failed",
      result: parsed.response,
    });
    return parsed;
  },
});

export const getUserContacts = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contacts")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.eq(q.field("isBlocked"), false))
      .collect();
  },
});

export const logVoiceCommand = internalMutation({
  args: {
    userId: v.id("users"),
    command: v.string(),
    language: v.string(),
    action: v.string(),
    status: v.union(v.literal("success"), v.literal("failed"), v.literal("pending")),
    result: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("voiceCommands", {
      userId: args.userId,
      command: args.command,
      language: args.language,
      action: args.action,
      status: args.status,
      result: args.result,
      executedAt: Date.now(),
    });
  },
});

export const getVoiceHistory = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("voiceCommands")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(50);
  },
});
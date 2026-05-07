import { mutation, query, action, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

// ── Gemini API helper — uses current 2026 models ──────────────────────────────
async function callGemini(prompt: string, userMessage: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in Convex environment variables");

  const models = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash-preview-04-17",
    "gemini-2.5-pro-preview-03-25",
  ];

  let lastError = "";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: `${prompt}\n\nMessage to analyze: ${userMessage}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
        },
      }),
    });

    if (res.status === 404 || res.status === 429) {
      lastError = await res.text();
      console.log(`[Gemini] ${model} unavailable (${res.status}), trying next...`);
      continue;
    }

    if (!res.ok) {
      lastError = await res.text();
      continue;
    }

    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
  }

  throw new Error(`Gemini API failed: ${lastError.slice(0, 200)}`);
}

export const analyzeMessageForReminder = action({
  args: {
    message: v.string(),
    senderName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const systemPrompt = `You are a reminder detection AI. Analyze the message and detect if it contains any reminder, appointment, meeting, deadline, or scheduled event.

Return ONLY valid JSON:
{
  "hasReminder": true/false,
  "reminderText": "extracted reminder description",
  "scheduledTime": "ISO date string if time mentioned, null otherwise",
  "confidence": 0.0-1.0
}

Examples:
- "Meeting tomorrow at 3pm" → {"hasReminder":true,"reminderText":"Meeting at 3pm","scheduledTime":"tomorrow 3pm","confidence":0.95}
- "Don't forget doctor appointment Friday" → {"hasReminder":true,"reminderText":"Doctor appointment on Friday","scheduledTime":null,"confidence":0.9}
- "How are you?" → {"hasReminder":false,"reminderText":"","scheduledTime":null,"confidence":0.0}`;

    const responseText = await callGemini(systemPrompt, args.message);

    let parsed: {
      hasReminder: boolean;
      reminderText: string;
      scheduledTime: string | null;
      confidence: number;
    };

    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { hasReminder: false, reminderText: "", scheduledTime: null, confidence: 0 };
    } catch {
      parsed = { hasReminder: false, reminderText: "", scheduledTime: null, confidence: 0 };
    }

    if (parsed.hasReminder && parsed.confidence > 0.7) {
      await ctx.runMutation(internal.reminders.saveReminder, {
        userId,
        sourceMessage: args.message,
        senderName: args.senderName,
        reminderText: parsed.reminderText,
        scheduledTime: parsed.scheduledTime ? new Date(parsed.scheduledTime).getTime() : undefined,
      });
    }

    return parsed;
  },
});

export const saveReminder = internalMutation({
  args: {
    userId: v.id("users"),
    sourceMessage: v.string(),
    senderName: v.string(),
    reminderText: v.string(),
    scheduledTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("reminders", {
      userId: args.userId,
      sourceMessage: args.sourceMessage,
      senderName: args.senderName,
      reminderText: args.reminderText,
      scheduledTime: args.scheduledTime,
      isNotified: false,
      detectedAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "reminder",
      title: "Reminder Detected",
      message: `From ${args.senderName}: "${args.reminderText}"`,
      isRead: false,
      createdAt: Date.now(),
    });
  },
});

export const getReminders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("reminders")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

export const markReminderNotified = mutation({
  args: { reminderId: v.id("reminders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder || reminder.userId !== userId) throw new Error("Not found");

    await ctx.db.patch(args.reminderId, { isNotified: true });
    return { success: true };
  },
});

export const deleteReminder = mutation({
  args: { reminderId: v.id("reminders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const reminder = await ctx.db.get(args.reminderId);
    if (!reminder || reminder.userId !== userId) throw new Error("Not found");

    await ctx.db.delete(args.reminderId);
    return { success: true };
  },
});
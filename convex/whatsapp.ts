import { mutation, query, httpAction, internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { internal } from "./_generated/api";

// ─────────────────────────────────────────────────────────────────────────────
// INTERNAL QUERIES & MUTATIONS (used by httpActions)
// ─────────────────────────────────────────────────────────────────────────────

export const getSessionBySessionId = internalQuery({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("whatsappSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

export const patchSessionQR = internalMutation({
  args: { sessionDocId: v.id("whatsappSessions"), qrCode: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionDocId, {
      qrCode: args.qrCode,
      status: "pending",
    });
  },
});

export const patchSessionConnected = internalMutation({
  args: {
    sessionDocId: v.id("whatsappSessions"),
    phoneNumber: v.string(),
    displayName: v.string(),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionDocId, {
      status: "connected",
      phoneNumber: args.phoneNumber,
      displayName: args.displayName,
      connectedAt: Date.now(),
      qrCode: undefined,
    });
    await ctx.db.insert("notifications", {
      userId: args.userId,
      type: "connection",
      title: "WhatsApp Connected ✓",
      message: `Connected as ${args.displayName} (${args.phoneNumber})`,
      isRead: false,
      createdAt: Date.now(),
    });
  },
});

export const patchSessionDisconnected = internalMutation({
  args: { sessionDocId: v.id("whatsappSessions") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionDocId, {
      status: "disconnected",
      phoneNumber: undefined,
      displayName: undefined,
      qrCode: undefined,
    });
  },
});

export const recordIncomingMessage = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const today = new Date().toISOString().split("T")[0];
    const stat = await ctx.db
      .query("messageStats")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", args.userId).eq("date", today)
      )
      .first();
    if (stat) {
      await ctx.db.patch(stat._id, { received: stat.received + 1 });
    } else {
      await ctx.db.insert("messageStats", {
        userId: args.userId,
        date: today,
        sent: 0,
        received: 1,
        automated: 0,
        voiceTriggered: 0,
      });
    }
  },
});

export const getActiveRules = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("automationRules")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .collect();
  },
});

export const recordAutoReply = internalMutation({
  args: {
    userId: v.id("users"),
    ruleId: v.id("automationRules"),
    triggerCount: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.ruleId, { triggerCount: args.triggerCount + 1 });
    const today = new Date().toISOString().split("T")[0];
    const stat = await ctx.db
      .query("messageStats")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", args.userId).eq("date", today)
      )
      .first();
    if (stat) {
      await ctx.db.patch(stat._id, {
        automated: stat.automated + 1,
        sent: stat.sent + 1,
      });
    }
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC MUTATIONS & QUERIES
// IMPORTANT: No fetch() calls inside mutations — Convex cloud cannot reach
// localhost. The frontend (browser) calls the bridge directly instead.
// ─────────────────────────────────────────────────────────────────────────────

export const generateQRSession = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("whatsappSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const sessionId = `session_${userId}_${Date.now()}`;
    const qrExpiry = Date.now() + 5 * 60 * 1000; // 5 minutes

    if (existing) {
      await ctx.db.patch(existing._id, {
        sessionId,
        status: "pending",
        qrCode: undefined,
        qrExpiry,
      });
    } else {
      await ctx.db.insert("whatsappSessions", {
        userId,
        sessionId,
        status: "pending",
        qrExpiry,
      });
    }

    // NO fetch() here — browser calls bridge directly after getting sessionId
    return { sessionId, qrExpiry };
  },
});

export const pollQRCode = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const session = await ctx.db
      .query("whatsappSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session) return null;

    return {
      qrCode: session.qrCode ?? null,
      status: session.status,
      qrExpiry: session.qrExpiry,
    };
  },
});

export const connectWhatsApp = mutation({
  args: {
    sessionId: v.string(),
    phoneNumber: v.string(),
    displayName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const session = await ctx.db
      .query("whatsappSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session) throw new Error("Session not found");

    await ctx.db.patch(session._id, {
      status: "connected",
      phoneNumber: args.phoneNumber,
      displayName: args.displayName,
      connectedAt: Date.now(),
      qrCode: undefined,
    });

    await ctx.db.insert("notifications", {
      userId,
      type: "connection",
      title: "WhatsApp Connected",
      message: `Successfully connected as ${args.displayName} (${args.phoneNumber})`,
      isRead: false,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const disconnectWhatsApp = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const session = await ctx.db
      .query("whatsappSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (session) {
      // NO fetch() here — browser calls bridge /disconnect directly
      await ctx.db.patch(session._id, {
        status: "disconnected",
        phoneNumber: undefined,
        displayName: undefined,
        qrCode: undefined,
      });
    }

    // Return sessionId so the browser can tell the bridge to disconnect
    return { success: true, sessionId: session?.sessionId ?? null };
  },
});

export const getSession = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    return await ctx.db
      .query("whatsappSessions")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP ACTIONS — called by the Node bridge server (whatsapp-server.js)
// Bridge posts to: https://your-deployment.convex.cloud/api/updateQR  etc.
// ─────────────────────────────────────────────────────────────────────────────

export const httpUpdateQR = httpAction(async (ctx, request) => {
  const { sessionId, qrCode } = await request.json();
  const session = await ctx.runQuery(internal.whatsapp.getSessionBySessionId, { sessionId });
  if (session) {
    await ctx.runMutation(internal.whatsapp.patchSessionQR, {
      sessionDocId: session._id,
      qrCode,
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

export const httpWhatsAppConnected = httpAction(async (ctx, request) => {
  const { sessionId, phoneNumber, displayName } = await request.json();
  const session = await ctx.runQuery(internal.whatsapp.getSessionBySessionId, { sessionId });
  if (session) {
    await ctx.runMutation(internal.whatsapp.patchSessionConnected, {
      sessionDocId: session._id,
      phoneNumber,
      displayName,
      userId: session.userId,
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

export const httpWhatsAppDisconnected = httpAction(async (ctx, request) => {
  const { sessionId } = await request.json();
  const session = await ctx.runQuery(internal.whatsapp.getSessionBySessionId, { sessionId });
  if (session) {
    await ctx.runMutation(internal.whatsapp.patchSessionDisconnected, {
      sessionDocId: session._id,
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});

export const httpIncomingMessage = httpAction(async (ctx, request) => {
  const { sessionId, from, body } = await request.json();
  const session = await ctx.runQuery(internal.whatsapp.getSessionBySessionId, { sessionId });

  if (!session) {
    return new Response(JSON.stringify({ ok: false, error: "session not found" }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const userId = session.userId;
  await ctx.runMutation(internal.whatsapp.recordIncomingMessage, { userId });

  const rules = await ctx.runQuery(internal.whatsapp.getActiveRules, { userId });
  const bodyLower = (body as string).toLowerCase();

  for (const rule of rules.filter((r) => r.isActive)) {
    if (bodyLower.includes(rule.trigger.toLowerCase())) {
      // Note: auto-reply fetch is done from bridge side, not here
      await ctx.runMutation(internal.whatsapp.recordAutoReply, {
        userId,
        ruleId: rule._id,
        triggerCount: rule.triggerCount,
      });
      break;
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
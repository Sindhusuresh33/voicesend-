import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const recordMessageStats = mutation({
  args: {
    sent: v.number(),
    received: v.number(),
    automated: v.number(),
    voiceTriggered: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const today = new Date().toISOString().split("T")[0];

    const existing = await ctx.db
      .query("messageStats")
      .withIndex("by_userId_and_date", (q) =>
        q.eq("userId", userId).eq("date", today)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        sent: existing.sent + args.sent,
        received: existing.received + args.received,
        automated: existing.automated + args.automated,
        voiceTriggered: existing.voiceTriggered + args.voiceTriggered,
      });
    } else {
      await ctx.db.insert("messageStats", {
        userId,
        date: today,
        ...args,
      });
    }

    return { success: true };
  },
});

export const getMessageStats = query({
  args: { days: v.number() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const stats = await ctx.db
      .query("messageStats")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.days);

    return stats.reverse();
  },
});

export const getDashboardStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const allStats = await ctx.db
      .query("messageStats")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const voiceCommands = await ctx.db
      .query("voiceCommands")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const reminders = await ctx.db
      .query("reminders")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const trustedDevices = await ctx.db
      .query("trustedDevices")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();

    const totalSent = allStats.reduce((s, r) => s + r.sent, 0);
    const totalReceived = allStats.reduce((s, r) => s + r.received, 0);
    const totalAutomated = allStats.reduce((s, r) => s + r.automated, 0);
    const totalVoice = voiceCommands.length;
    const successfulVoice = voiceCommands.filter((v) => v.status === "success").length;

    return {
      totalSent,
      totalReceived,
      totalAutomated,
      totalVoice,
      successfulVoice,
      totalReminders: reminders.length,
      pendingReminders: reminders.filter((r) => !r.isNotified).length,
      trustedDevices: trustedDevices.filter((d) => d.isTrusted).length,
    };
  },
});

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const createRule = mutation({
  args: {
    name: v.string(),
    trigger: v.string(),
    response: v.string(),
    language: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    await ctx.db.insert("automationRules", {
      userId,
      name: args.name,
      trigger: args.trigger,
      response: args.response,
      language: args.language,
      isActive: true,
      triggerCount: 0,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const getRules = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("automationRules")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const toggleRule = mutation({
  args: { ruleId: v.id("automationRules") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.userId !== userId) throw new Error("Rule not found");

    await ctx.db.patch(args.ruleId, { isActive: !rule.isActive });
    return { success: true };
  },
});

export const deleteRule = mutation({
  args: { ruleId: v.id("automationRules") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const rule = await ctx.db.get(args.ruleId);
    if (!rule || rule.userId !== userId) throw new Error("Rule not found");

    await ctx.db.delete(args.ruleId);
    return { success: true };
  },
});

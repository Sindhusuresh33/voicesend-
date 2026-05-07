import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

export const addContact = mutation({
  args: {
    phoneNumber: v.string(),
    displayName: v.string(),
    profilePic: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("contacts")
      .withIndex("by_userId_and_phone", (q) =>
        q.eq("userId", userId).eq("phoneNumber", args.phoneNumber)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName: args.displayName,
        profilePic: args.profilePic,
      });
      return { success: true, updated: true };
    }

    await ctx.db.insert("contacts", {
      userId,
      phoneNumber: args.phoneNumber,
      displayName: args.displayName,
      profilePic: args.profilePic,
      isBlocked: false,
    });

    return { success: true, updated: false };
  },
});

export const getContacts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("contacts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const toggleBlockContact = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Contact not found");

    await ctx.db.patch(args.contactId, { isBlocked: !contact.isBlocked });
    return { success: true };
  },
});

export const deleteContact = mutation({
  args: { contactId: v.id("contacts") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const contact = await ctx.db.get(args.contactId);
    if (!contact || contact.userId !== userId) throw new Error("Contact not found");

    await ctx.db.delete(args.contactId);
    return { success: true };
  },
});

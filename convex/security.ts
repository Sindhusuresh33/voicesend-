import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";

function simpleHash(pin: string): string {
  let hash = 0;
  for (let i = 0; i < pin.length; i++) {
    const char = pin.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36) + pin.length.toString();
}

export const setupPIN = mutation({
  args: { pin: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    if (args.pin.length < 4 || args.pin.length > 8) {
      throw new Error("PIN must be 4-8 digits");
    }

    const existing = await ctx.db
      .query("securityPins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    const pinHash = simpleHash(args.pin);

    if (existing) {
      await ctx.db.patch(existing._id, {
        pinHash,
        failedAttempts: 0,
        isBlocked: false,
        blockedUntil: undefined,
      });
    } else {
      await ctx.db.insert("securityPins", {
        userId,
        pinHash,
        failedAttempts: 0,
        isBlocked: false,
      });
    }

    await ctx.db.insert("notifications", {
      userId,
      type: "security",
      title: "Security PIN Set",
      message: "Your security PIN has been configured successfully.",
      isRead: false,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const verifyPIN = mutation({
  args: {
    pin: v.string(),
    deviceId: v.string(),
    deviceName: v.string(),
    deviceType: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");

    const pinRecord = await ctx.db
      .query("securityPins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!pinRecord) throw new Error("No PIN configured");

    const now = Date.now();
    const pinHash = simpleHash(args.pin);
    const isCorrect = pinHash === pinRecord.pinHash;

    // Log every attempt
    await ctx.db.insert("loginAttempts", {
      userId,
      deviceId: args.deviceId,
      success: isCorrect,
      attemptedAt: now,
    });

    if (!isCorrect) {
      // Just increment counter for logging — no blocking
      await ctx.db.patch(pinRecord._id, {
        failedAttempts: (pinRecord.failedAttempts ?? 0) + 1,
        lastAttemptAt: now,
      });
      throw new Error("Incorrect PIN. Please try again.");
    }

    // ── Correct PIN — reset counter and trust device ───────────────────────
    await ctx.db.patch(pinRecord._id, {
      failedAttempts: 0,
      isBlocked: false,
      blockedUntil: undefined,
      lastAttemptAt: now,
    });

    const existingDevice = await ctx.db
      .query("trustedDevices")
      .withIndex("by_userId_and_deviceId", (q) =>
        q.eq("userId", userId).eq("deviceId", args.deviceId)
      )
      .first();

    if (existingDevice) {
      await ctx.db.patch(existingDevice._id, { isTrusted: true, lastSeen: now });
    } else {
      await ctx.db.insert("trustedDevices", {
        userId,
        deviceId: args.deviceId,
        deviceName: args.deviceName,
        deviceType: args.deviceType,
        isTrusted: true,
        lastSeen: now,
        addedAt: now,
      });
    }

    return { success: true, trusted: true };
  },
});

export const checkDeviceTrust = query({
  args: { deviceId: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { trusted: false, hasPIN: false };

    const pinRecord = await ctx.db
      .query("securityPins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!pinRecord) return { trusted: true, hasPIN: false };

    const device = await ctx.db
      .query("trustedDevices")
      .withIndex("by_userId_and_deviceId", (q) =>
        q.eq("userId", userId).eq("deviceId", args.deviceId)
      )
      .first();

    return {
      trusted: device?.isTrusted ?? false,
      hasPIN: true,
      isBlocked: false,
      failedAttempts: pinRecord.failedAttempts,
    };
  },
});

export const getTrustedDevices = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("trustedDevices")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .collect();
  },
});

export const removeTrustedDevice = mutation({
  args: { deviceId: v.id("trustedDevices") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Not authenticated");
    const device = await ctx.db.get(args.deviceId);
    if (!device || device.userId !== userId) throw new Error("Device not found");
    await ctx.db.delete(args.deviceId);
    return { success: true };
  },
});

export const getPINStatus = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const pinRecord = await ctx.db
      .query("securityPins")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (!pinRecord) return { hasPIN: false };

    return {
      hasPIN: true,
      isBlocked: false,
      failedAttempts: pinRecord.failedAttempts,
      blockedUntil: undefined,
    };
  },
});

export const getLoginAttempts = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("loginAttempts")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .order("desc")
      .take(20);
  },
});
import { defineSchema, defineTable } from "convex/server";
import { authTables } from "@convex-dev/auth/server";
import { v } from "convex/values";

const applicationTables = {
  // WhatsApp sessions linked to users
  whatsappSessions: defineTable({
    userId: v.id("users"),
    sessionId: v.string(),
    phoneNumber: v.optional(v.string()),
    displayName: v.optional(v.string()),
    profilePic: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("connected"),
      v.literal("disconnected")
    ),
    qrCode: v.optional(v.string()),
    qrExpiry: v.optional(v.number()),
    connectedAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_sessionId", ["sessionId"]),

  // Trusted devices for security
  trustedDevices: defineTable({
    userId: v.id("users"),
    deviceId: v.string(),
    deviceName: v.string(),
    deviceType: v.string(),
    ipAddress: v.optional(v.string()),
    isTrusted: v.boolean(),
    lastSeen: v.number(),
    addedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_deviceId", ["userId", "deviceId"]),

  // Security PIN for device verification
  securityPins: defineTable({
    userId: v.id("users"),
    pinHash: v.string(),
    failedAttempts: v.number(),
    isBlocked: v.boolean(),
    blockedUntil: v.optional(v.number()),
    lastAttemptAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  // Login attempts log
  loginAttempts: defineTable({
    userId: v.id("users"),
    deviceId: v.string(),
    success: v.boolean(),
    ipAddress: v.optional(v.string()),
    attemptedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Voice commands log
  voiceCommands: defineTable({
    userId: v.id("users"),
    command: v.string(),
    language: v.string(),
    action: v.string(),
    status: v.union(v.literal("success"), v.literal("failed"), v.literal("pending")),
    result: v.optional(v.string()),
    executedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Messages analytics
  messageStats: defineTable({
    userId: v.id("users"),
    date: v.string(), // YYYY-MM-DD
    sent: v.number(),
    received: v.number(),
    automated: v.number(),
    voiceTriggered: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_date", ["userId", "date"]),

  // Reminders detected from messages
  reminders: defineTable({
    userId: v.id("users"),
    sourceMessage: v.string(),
    senderName: v.string(),
    reminderText: v.string(),
    scheduledTime: v.optional(v.number()),
    isNotified: v.boolean(),
    detectedAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Automation rules
  automationRules: defineTable({
    userId: v.id("users"),
    name: v.string(),
    trigger: v.string(),
    response: v.string(),
    language: v.string(),
    isActive: v.boolean(),
    triggerCount: v.number(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),

  // Contacts (synced from WhatsApp)
  contacts: defineTable({
    userId: v.id("users"),
    phoneNumber: v.string(),
    displayName: v.string(),
    profilePic: v.optional(v.string()),
    isBlocked: v.boolean(),
    lastMessageAt: v.optional(v.number()),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_and_phone", ["userId", "phoneNumber"]),

  // Notifications
  notifications: defineTable({
    userId: v.id("users"),
    type: v.string(),
    title: v.string(),
    message: v.string(),
    isRead: v.boolean(),
    createdAt: v.number(),
  }).index("by_userId", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});

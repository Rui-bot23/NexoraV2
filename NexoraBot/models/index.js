/**
 * Nexora — Mongoose Models
 */

const { model, Schema } = require("mongoose");

// ── License ──────────────────────────────────────────────────────────────────
const licenseSchema = new Schema({
  licenseKey:    { type: String, required: true, unique: true },
  productName:   { type: String, required: true },
  description:   { type: String, default: "" },
  permanent:     { type: Boolean, default: false },
  expiresAt:     { type: Number, default: 0 },       // 0 = never
  suspended:     { type: Boolean, default: false },
  reset:         { type: Boolean, default: false },

  // Usage tracking
  isUsed:        { type: Boolean, default: false },
  usedAt:        { type: Number, default: 0 },
  profile:       { type: Array, default: [] },       // bound user profiles
  authorization: { type: String, default: "null" },

  // IP / HWID
  maxIp:         { type: Number, default: 1 },
  maxHwId:       { type: Number, default: 1 },
  latestIp:      { type: String, default: null },
  latestHwId:    { type: String, default: null },
  ipArray:       { type: Array, default: [] },
  hwidArray:     { type: Array, default: [] },
  attempts:      { type: Number, default: 0 },       // failed validation attempts

  // Metadata
  totalRequests: { type: Number, default: 0 },
  createdAt:     { type: Number, default: () => Date.now() },
  editedAt:      { type: Number, default: 0 },
  createdBy:     { type: String, default: null },    // Discord user ID
});

// ── Product ──────────────────────────────────────────────────────────────────
const productSchema = new Schema({
  productId:      { type: String, required: true, unique: true },
  productName:    { type: String, required: true },
  description:    { type: String, default: "" },
  version:        { type: String, default: "1.0.0" },
  price:          { type: String, default: "Free" },
  totalPurchases: { type: Number, default: 0 },
  createdAt:      { type: String, default: () => new Date().toISOString() },
  createdBy:      { type: String, default: null },
});

// ── Blacklist ─────────────────────────────────────────────────────────────────
const blacklistSchema = new Schema({
  type:      { type: String, required: true },   // "user" | "ip" | "hwid"
  value:     { type: String, required: true },
  reason:    { type: String, default: "No reason provided" },
  createdAt: { type: String, default: () => new Date().toISOString() },
  createdBy: { type: String, default: null },
});

// ── Ticket ────────────────────────────────────────────────────────────────────
const ticketSchema = new Schema({
  ticketId:    { type: String, required: true, unique: true },
  channelId:   { type: String, required: true },
  guildId:     { type: String, required: true },
  ownerId:     { type: String, required: true },
  ownerTag:    { type: String, required: true },
  category:    { type: String, default: "General Support" },
  subject:     { type: String, default: "" },
  description: { type: String, default: "" },
  priority:    { type: String, default: "Normal" },   // Low | Normal | High | Critical
  status:      { type: String, default: "open" },     // open | closed
  claimedBy:   { type: String, default: null },
  rating:      { type: Number, default: null },
  createdAt:   { type: Number, default: () => Date.now() },
  closedAt:    { type: Number, default: null },
});

// ── Review ────────────────────────────────────────────────────────────────────
const reviewSchema = new Schema({
  reviewId:   { type: String, required: true, unique: true },
  guildId:    { type: String, required: true },
  userId:     { type: String, required: true },
  userTag:    { type: String, required: true },
  userAvatar: { type: String, default: null },
  rating:     { type: Number, required: true, min: 1, max: 5 },
  content:    { type: String, required: true },
  imageUrl:   { type: String, default: null },
  messageId:  { type: String, default: null },
  createdAt:  { type: Number, default: () => Date.now() },
  edited:     { type: Boolean, default: false },
});

// ── Review Blacklist (separate, JSON-based cooldown stored in memory) ─────────
const reviewBlacklistSchema = new Schema({
  userId:    { type: String, required: true, unique: true },
  reason:    { type: String, default: "No reason provided" },
  createdBy: { type: String, default: null },
  createdAt: { type: Number, default: () => Date.now() },
});

// ── Guild Config (all setup done via slash commands, stored here) ─────────────
const guildConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // Branding
  brandName:   { type: String, default: "Nexora" },
  brandColor:  { type: String, default: "5865F2" },
  brandFooter: { type: String, default: "Nexora Support" },
  brandIcon:   { type: String, default: null },

  // Tickets
  ticketLogChannelId:    { type: String, default: null },
  ticketCategoryId:      { type: String, default: null },  // Discord category channel
  ticketSupportRoleIds:  { type: [String], default: [] },
  ticketMaxPerUser:      { type: Number, default: 1 },
  ticketDmTranscript:    { type: Boolean, default: true },
  ticketCloseDelay:      { type: Number, default: 5 },
  ticketRatingsEnabled:  { type: Boolean, default: true },

  // Reviews
  reviewChannelId:  { type: String, default: null },
  reviewLogChannelId: { type: String, default: null },
  reviewAdminRoleIds: { type: [String], default: [] },
  reviewAllowImages:  { type: Boolean, default: true },
  reviewMaxLength:    { type: Number, default: 500 },
  reviewCooldown:     { type: Number, default: 60 },

  // Licensing API
  apiEnabled: { type: Boolean, default: true },
});

// ── Ticket Category (created via /createticket, stored per guild) ─────────────
const ticketCategorySchema = new Schema({
  guildId:     { type: String, required: true },
  categoryId:  { type: String, required: true, unique: true }, // internal uuid
  name:        { type: String, required: true },
  description: { type: String, default: "Open a support ticket" },
  emoji:       { type: String, default: "🎫" },
  prefix:      { type: String, required: true },
  teamPingId:  { type: String, default: null },  // role or @everyone id
  createdAt:   { type: Number, default: () => Date.now() },
});

module.exports = {
  License:         model("NexoraLicense",         licenseSchema),
  Product:         model("NexoraProduct",         productSchema),
  Blacklist:       model("NexoraBlacklist",        blacklistSchema),
  Ticket:          model("NexoraTicket",           ticketSchema),
  Review:          model("NexoraReview",           reviewSchema),
  ReviewBlacklist: model("NexoraReviewBlacklist",  reviewBlacklistSchema),
  GuildConfig:     model("NexoraGuildConfig",      guildConfigSchema),
  TicketCategory:  model("NexoraTicketCategory",   ticketCategorySchema),
};

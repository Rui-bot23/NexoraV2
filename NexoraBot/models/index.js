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

  // Redeem system
  redeemEnabled: { type: Boolean, default: false },  // admin enables redeem for this key
  redeemedBy:    { type: String, default: null },     // Discord user ID who redeemed
  redeemedAt:    { type: Number, default: null },

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

// ── Ticket Category ──────────────────────────────────────────────────────────
const ticketCategorySchema = new Schema({
  guildId:     { type: String, required: true },
  categoryId:  { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  description: { type: String, default: "Open a support ticket" },
  emoji:       { type: String, default: "🎫" },
  prefix:      { type: String, required: true },
  teamPingId:  { type: String, default: null },
  createdAt:   { type: Number, default: () => Date.now() },
});

// ── GuildConfig ──────────────────────────────────────────────────────────────
const guildConfigSchema = new Schema({
  guildId: { type: String, required: true, unique: true },

  // Welcome
  welcomeChannelId:    { type: String, default: null },
  welcomeBannerUrl:    { type: String, default: null },
  welcomeTitle:        { type: String, default: "Welcome to Nexora" },
  welcomeDescription:  { type: String, default: "Hey {user}, welcome to **Nexora**!" },
  welcomeVerifyChannelId:  { type: String, default: null },
  welcomeTicketChannelId:  { type: String, default: null },
  welcomeVerifyLabel:  { type: String, default: "Verify" },
  welcomeTicketLabel:  { type: String, default: "Ticket System" },
  welcomeVerifyUrl:    { type: String, default: null },
  welcomeTicketUrl:    { type: String, default: null },

  // Tickets
  ticketLogChannelId:    { type: String, default: null },
  ticketCategoryId:      { type: String, default: null },
  ticketSupportRoleIds:  { type: [String], default: [] },
  ticketMaxPerUser:      { type: Number, default: 1 },
  ticketDmTranscript:    { type: Boolean, default: true },
  ticketCloseDelay:      { type: Number, default: 5 },
  ticketPanelTitle:      { type: String, default: "Nexora - Tickets" },
  ticketPanelBefore:     { type: String, default: "Think about your request in advance and describe it clearly and concisely. The more precise your information, the faster and more efficiently we can help you." },
  ticketPanelWhyUs:      { type: String, default: "Fast, reliable support without detours. Clear processes, high quality and a team that delivers instead of just promising." },

  // Redeem test mode (disables license validation for testing)
  redeemTestMode: { type: Boolean, default: false },
});

const GuildConfig = require("mongoose").models.NexoraGuildConfig || require("mongoose").models.NexoraGuildConfig || model("NexoraGuildConfig", guildConfigSchema);

module.exports = {
  License:         require("mongoose").models.NexoraLicense || model("NexoraLicense", licenseSchema),
  GuildConfig,
  Product:         require("mongoose").models.NexoraProduct || model("NexoraProduct", productSchema),
  Blacklist:       require("mongoose").models.NexoraBlacklist || model("NexoraBlacklist", blacklistSchema),
  Ticket:          require("mongoose").models.NexoraTicket || model("NexoraTicket", ticketSchema),
  Review:          require("mongoose").models.NexoraReview || model("NexoraReview", reviewSchema),
  ReviewBlacklist: require("mongoose").models.NexoraReviewBlacklist || model("NexoraReviewBlacklist", reviewBlacklistSchema),
  TicketCategory:  require("mongoose").models.NexoraTicketCategory || model("NexoraTicketCategory", ticketCategorySchema),
};

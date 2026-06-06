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
  expiresAt:     { type: Number, default: 0 },
  suspended:     { type: Boolean, default: false },
  reset:         { type: Boolean, default: false },
  isUsed:        { type: Boolean, default: false },
  usedAt:        { type: Number, default: 0 },
  profile:       { type: Array, default: [] },
  authorization: { type: String, default: "null" },
  maxIp:         { type: Number, default: 1 },
  maxHwId:       { type: Number, default: 1 },
  latestIp:      { type: String, default: null },
  latestHwId:    { type: String, default: null },
  ipArray:       { type: Array, default: [] },
  hwidArray:     { type: Array, default: [] },
  attempts:      { type: Number, default: 0 },
  redeemEnabled: { type: Boolean, default: false },
  redeemedBy:    { type: String, default: null },
  redeemedAt:    { type: Number, default: null },
  totalRequests: { type: Number, default: 0 },
  createdAt:     { type: Number, default: () => Date.now() },
  editedAt:      { type: Number, default: 0 },
  createdBy:     { type: String, default: null },
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
  type:      { type: String, required: true },
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
  priority:    { type: String, default: "Normal" },
  status:      { type: String, default: "open" },
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

// ── Review Blacklist ──────────────────────────────────────────────────────────
const reviewBlacklistSchema = new Schema({
  userId:    { type: String, required: true, unique: true },
  reason:    { type: String, default: "No reason provided" },
  createdBy: { type: String, default: null },
  createdAt: { type: Number, default: () => Date.now() },
});

// ── Ticket Category ───────────────────────────────────────────────────────────
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

// ── Vouch ─────────────────────────────────────────────────────────────────────
const vouchSchema = new Schema({
  vouchId:       { type: String, required: true, unique: true },
  guildId:       { type: String, required: true },
  sellerId:      { type: String, required: true },
  buyerId:       { type: String, required: true },
  buyerTag:      { type: String, required: true },
  product:       { type: String, default: null },
  price:         { type: String, default: null },
  rating:        { type: Number, required: true, min: 1, max: 5 },
  note:          { type: String, default: "" },
  imageUrl:      { type: String, default: null },
  messageId:     { type: String, default: null },
  createdAt:     { type: Number, default: () => Date.now() },
  removed:       { type: Boolean, default: false },
  removedBy:     { type: String, default: null },
  removedReason: { type: String, default: null },
});

// ── Giveaway ──────────────────────────────────────────────────────────────────
const giveawaySchema = new Schema({
  giveawayId:       { type: String, required: true, unique: true },
  guildId:          { type: String, required: true },
  channelId:        { type: String, required: true },
  messageId:        { type: String, default: null },
  prize:            { type: String, required: true },
  description:      { type: String, default: "" },
  hostedBy:         { type: String, required: true },
  winnerCount:      { type: Number, default: 1 },
  participants:     { type: [String], default: [] },
  winners:          { type: [String], default: [] },
  endsAt:           { type: Number, required: true },
  ended:            { type: Boolean, default: false },
  paused:           { type: Boolean, default: false },
  pausedAt:         { type: Number, default: null },
  remainingMs:      { type: Number, default: null },
  requiredRoles:    { type: [String], default: [] },
  minAccountDays:   { type: Number, default: 0 },
  nitroBoosterOnly: { type: Boolean, default: false },
  roleMultipliers:  { type: [String], default: [] },
  createdAt:        { type: Number, default: () => Date.now() },
});

// ── Account ───────────────────────────────────────────────────────────────────
const accountSchema = new Schema({
  discordId:     { type: String, required: true, unique: true },
  discordTag:    { type: String, required: true },
  email:         { type: String, required: true, unique: true },
  passwordHash:  { type: String, required: true },
  licenseKey:    { type: String, required: true },
  productName:   { type: String, default: "" },
  createdAt:     { type: Number, default: () => Date.now() },
  lastLogin:     { type: Number, default: null },
  downloadToken: { type: String, default: null },
});

// ── GuildConfig ───────────────────────────────────────────────────────────────
const guildConfigSchema = new Schema({
  guildId:               { type: String, required: true, unique: true },
  welcomeChannelId:      { type: String, default: null },
  welcomeBannerUrl:      { type: String, default: null },
  welcomeTitle:          { type: String, default: "Welcome to Nexora" },
  welcomeDescription:    { type: String, default: "Hey {user}, welcome to **Nexora**!" },
  welcomeVerifyChannelId:{ type: String, default: null },
  welcomeTicketChannelId:{ type: String, default: null },
  welcomeVerifyLabel:    { type: String, default: "Verify" },
  welcomeTicketLabel:    { type: String, default: "Ticket System" },
  welcomeVerifyUrl:      { type: String, default: null },
  welcomeTicketUrl:      { type: String, default: null },
  vouchChannelId:        { type: String, default: null },
  vouchLogChannelId:     { type: String, default: null },
  giveawayLogChannelId:  { type: String, default: null },
  giveawayManagerRoleId: { type: String, default: null },
  ticketLogChannelId:    { type: String, default: null },
  ticketCategoryId:      { type: String, default: null },
  ticketSupportRoleIds:  { type: [String], default: [] },
  ticketMaxPerUser:      { type: Number, default: 1 },
  ticketDmTranscript:    { type: Boolean, default: true },
  ticketCloseDelay:      { type: Number, default: 5 },
  ticketPanelTitle:      { type: String, default: "Nexora - Tickets" },
  ticketPanelBefore:     { type: String, default: "Think about your request in advance and describe it clearly and concisely." },
  ticketPanelWhyUs:      { type: String, default: "Fast, reliable support without detours." },
  redeemTestMode:        { type: Boolean, default: false },
});

// ── Cache-safe model definitions ──────────────────────────────────────────────
const m = (name, schema) => require("mongoose").models[name] || model(name, schema);

module.exports = {
  License:         m("NexoraLicense",         licenseSchema),
  Product:         m("NexoraProduct",         productSchema),
  Blacklist:       m("NexoraBlacklist",       blacklistSchema),
  Ticket:          m("NexoraTicket",          ticketSchema),
  Review:          m("NexoraReview",          reviewSchema),
  ReviewBlacklist: m("NexoraReviewBlacklist", reviewBlacklistSchema),
  TicketCategory:  m("NexoraTicketCategory",  ticketCategorySchema),
  Vouch:           m("NexoraVouch",           vouchSchema),
  Giveaway:        m("NexoraGiveaway",        giveawaySchema),
  Account:         m("NexoraAccount",         accountSchema),
  GuildConfig:     m("NexoraGuildConfig",     guildConfigSchema),
};

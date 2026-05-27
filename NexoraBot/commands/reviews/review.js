/**
 * /review — Nexora Review System
 * Subcommands: submit | delete | list | stats | blacklist add/remove
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  AttachmentBuilder,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const { Review, ReviewBlacklist } = require("../../models");
const { getGuildConfig } = require("../../utils/guildConfig");
const { successEmbed, errorEmbed, infoEmbed, warningEmbed, hex } = require("../../utils/embeds");

// In-memory cooldown map: userId -> timestamp
const cooldowns = new Map();

function stars(n) {
  return "⭐".repeat(n) + "☆".repeat(5 - n);
}

function isReviewAdmin(interaction, cfg) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) return true;
  const adminRoles = cfg.reviewAdminRoleIds || [];
  return interaction.member?.roles.cache.some(r => adminRoles.includes(r.id));
}

const data = new SlashCommandBuilder()
  .setName("review")
  .setDescription("Nexora review system")

  .addSubcommand(sub =>
    sub.setName("submit")
      .setDescription("Submit a review")
      .addIntegerOption(o =>
        o.setName("rating").setDescription("Rating (1–5 stars)").setRequired(true).setMinValue(1).setMaxValue(5)
      )
      .addStringOption(o => o.setName("content").setDescription("Your review").setRequired(true))
      .addAttachmentOption(o => o.setName("image").setDescription("Optional screenshot or image"))
  )
  .addSubcommand(sub =>
    sub.setName("delete")
      .setDescription("Delete a review (admin only)")
      .addStringOption(o => o.setName("review_id").setDescription("Review ID to delete").setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName("list")
      .setDescription("List recent reviews")
      .addIntegerOption(o => o.setName("rating").setDescription("Filter by star rating (1–5)").setMinValue(1).setMaxValue(5))
  )
  .addSubcommand(sub =>
    sub.setName("stats")
      .setDescription("View review statistics")
  )
  .addSubcommand(sub =>
    sub.setName("blacklist")
      .setDescription("Blacklist/unblacklist a user from reviews (admin only)")
      .addStringOption(o =>
        o.setName("action").setDescription("Action").setRequired(true)
          .addChoices({ name: "Add", value: "add" }, { name: "Remove", value: "remove" })
      )
      .addUserOption(o => o.setName("user").setDescription("User to blacklist/unblacklist").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason"))
  );

async function execute(interaction) {
  const cfg = await getGuildConfig(interaction.guild.id);
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === "submit")    return await handleSubmit(interaction, cfg);
    if (sub === "delete")    return await handleDelete(interaction, cfg);
    if (sub === "list")      return await handleList(interaction, cfg);
    if (sub === "stats")     return await handleStats(interaction, cfg);
    if (sub === "blacklist") return await handleBlacklist(interaction, cfg);
  } catch (err) {
    console.error("[REVIEW CMD]", err);
    const payload = { embeds: [errorEmbed("Error", err.message)], ephemeral: true };
    return interaction.replied || interaction.deferred
      ? interaction.editReply(payload)
      : interaction.reply(payload);
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────
async function handleSubmit(interaction, cfg) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;

  // Blacklist check
  const bl = await ReviewBlacklist.findOne({ userId });
  if (bl) {
    return interaction.editReply({
      embeds: [errorEmbed("Blacklisted", `You are blacklisted from submitting reviews.\n**Reason:** ${bl.reason}`)],
    });
  }

  // Cooldown check
  const cooldownSecs = cfg.reviewCooldown ?? 60;
  const lastUsed = cooldowns.get(userId) || 0;
  const remaining = cooldownSecs * 1000 - (Date.now() - lastUsed);
  if (remaining > 0) {
    return interaction.editReply({
      embeds: [warningEmbed("Slow Down", `You can submit another review <t:${Math.floor((Date.now() + remaining) / 1000)}:R>.`)],
    });
  }

  const rating  = interaction.options.getInteger("rating");
  const content = interaction.options.getString("content");
  const image   = interaction.options.getAttachment("image");
  const maxLen  = cfg.reviewMaxLength ?? 500;

  if (content.length > maxLen) {
    return interaction.editReply({
      embeds: [errorEmbed("Too Long", `Reviews must be under ${maxLen} characters. Yours is ${content.length}.`)],
    });
  }

  if (image && (cfg.reviewAllowImages === false)) {
    return interaction.editReply({ embeds: [errorEmbed("Images Disabled", "Image attachments are not allowed in reviews.")] });
  }

  const reviewId = uuidv4().split("-")[0].toUpperCase();
  const review = await Review.create({
    reviewId,
    guildId:    interaction.guild.id,
    userId,
    userTag:    interaction.user.tag,
    userAvatar: interaction.user.displayAvatarURL(),
    rating,
    content,
    imageUrl: image?.url || null,
  });

  // Post to review channel
  const reviewChannelId = cfg.reviewChannelId;
  if (reviewChannelId) {
    const channel = interaction.guild.channels.cache.get(reviewChannelId);
    if (channel) {
      const embed = new EmbedBuilder()
        .setColor(ratingColor(rating))
        .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
        .setTitle(`${stars(rating)} Review`)
        .setDescription(content)
        .addFields({ name: "🆔 Review ID", value: `\`${reviewId}\``, inline: true })
        .setTimestamp();

      if (image?.url) embed.setImage(image.url);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`nexora_review_delete_${reviewId}`)
          .setLabel("Delete")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("🗑️")
      );

      const msg = await channel.send({ embeds: [embed], components: [row] });
      review.messageId = msg.id;
      await review.save();
    }
  }

  cooldowns.set(userId, Date.now());

  return interaction.editReply({
    embeds: [successEmbed("Review Submitted", `Your ${stars(rating)} review has been posted!\n**ID:** \`${reviewId}\``)],
  });
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function handleDelete(interaction, cfg) {
  if (!isReviewAdmin(interaction, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only review admins can delete reviews.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const reviewId = interaction.options.getString("review_id").toUpperCase();
  const review = await Review.findOneAndDelete({ reviewId });

  if (!review) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `No review found with ID \`${reviewId}\`.`)] });
  }

  // Delete message from channel
  const reviewChannelId = cfg.reviewChannelId;
  if (reviewChannelId && review.messageId) {
    try {
      const channel = interaction.guild.channels.cache.get(reviewChannelId);
      const msg = await channel?.messages.fetch(review.messageId);
      await msg?.delete();
    } catch {}
  }

  // Log deletion
  const logChannelId = cfg.reviewLogChannelId;
  if (logChannelId) {
    const logChannel = interaction.guild.channels.cache.get(logChannelId);
    logChannel?.send({
      embeds: [
        errorEmbed("Review Deleted", `Review \`${reviewId}\` by <@${review.userId}> deleted by ${interaction.user}.`)
          .addFields({ name: "Content", value: review.content }),
      ],
    });
  }

  return interaction.editReply({ embeds: [successEmbed("Deleted", `Review \`${reviewId}\` has been removed.`)] });
}

// ── List ──────────────────────────────────────────────────────────────────────
async function handleList(interaction, cfg) {
  await interaction.deferReply();
  const ratingFilter = interaction.options.getInteger("rating");
  const query = { guildId: interaction.guild.id };
  if (ratingFilter) query.rating = ratingFilter;

  const reviews = await Review.find(query).sort({ createdAt: -1 }).limit(10);
  if (!reviews.length) {
    return interaction.editReply({ embeds: [infoEmbed("No Reviews", "No reviews found.")] });
  }

  const embed = new EmbedBuilder()
    .setColor(hex(cfg.brandColor || "5865F2"))
    .setTitle("📝 Recent Reviews")
    .setTimestamp();

  for (const r of reviews) {
    embed.addFields({
      name: `${stars(r.rating)} — ${r.userTag} (ID: ${r.reviewId})`,
      value: r.content.length > 120 ? r.content.slice(0, 117) + "..." : r.content,
    });
  }

  return interaction.editReply({ embeds: [embed] });
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function handleStats(interaction, cfg) {
  await interaction.deferReply();
  const guildId = interaction.guild.id;

  const total = await Review.countDocuments({ guildId });
  if (total === 0) {
    return interaction.editReply({ embeds: [infoEmbed("No Reviews", "No reviews have been submitted yet.")] });
  }

  const agg = await Review.aggregate([
    { $match: { guildId } },
    { $group: { _id: null, avg: { $avg: "$rating" }, sum: { $sum: "$rating" } } },
  ]);

  const avg = agg[0]?.avg?.toFixed(2) ?? "0.00";

  const breakdown = await Review.aggregate([
    { $match: { guildId } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
  ]);

  const bLines = breakdown.map(b => `${stars(b._id)}: **${b.count}** review${b.count !== 1 ? "s" : ""}`).join("\n");

  return interaction.editReply({
    embeds: [
      infoEmbed("Review Statistics", `**Average Rating:** ${stars(Math.round(avg))} (${avg}/5)`)
        .addFields(
          { name: "Total Reviews", value: `${total}`, inline: true },
          { name: "Breakdown",     value: bLines || "*None*", inline: false },
        ),
    ],
  });
}

// ── Blacklist ─────────────────────────────────────────────────────────────────
async function handleBlacklist(interaction, cfg) {
  if (!isReviewAdmin(interaction, cfg)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only review admins can manage the review blacklist.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const action = interaction.options.getString("action");
  const user   = interaction.options.getUser("user");
  const reason = interaction.options.getString("reason") || "No reason provided";

  if (action === "add") {
    const existing = await ReviewBlacklist.findOne({ userId: user.id });
    if (existing) {
      return interaction.editReply({ embeds: [warningEmbed("Already Blacklisted", `${user.tag} is already blacklisted from reviews.`)] });
    }
    await ReviewBlacklist.create({ userId: user.id, reason, createdBy: interaction.user.id });
    return interaction.editReply({ embeds: [successEmbed("User Blacklisted", `${user.tag} can no longer submit reviews.\n**Reason:** ${reason}`)] });
  }

  if (action === "remove") {
    const removed = await ReviewBlacklist.findOneAndDelete({ userId: user.id });
    if (!removed) {
      return interaction.editReply({ embeds: [errorEmbed("Not Blacklisted", `${user.tag} is not in the review blacklist.`)] });
    }
    return interaction.editReply({ embeds: [successEmbed("Blacklist Removed", `${user.tag} can now submit reviews again.`)] });
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function ratingColor(rating) {
  const colors = { 1: 0xED4245, 2: 0xE67E22, 3: 0xFEE75C, 4: 0x57F287, 5: 0x2ECC71 };
  return colors[rating] || 0x5865F2;
}

module.exports = { data, execute };

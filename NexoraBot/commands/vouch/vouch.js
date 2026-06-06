/**
 * Vouch System — inspired by veya-bot/discord-vouchbot
 * Upgraded to Components V2 + MongoDB storage
 *
 * /vouch       — Submit a vouch for a seller
 * /profile     — View a seller's vouch profile
 * /stats       — Server-wide vouch stats
 * /leaderboard — Top 10 sellers by vouch count
 * /removevouch — Remove a vouch (staff)
 * /vouchsetup  — Configure vouch channel
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const { Vouch } = require("../../models");
const { getGuildConfig, updateGuildConfig } = require("../../utils/guildConfig");

// ── Stars helper ──────────────────────────────────────────────────────────────
function stars(n) {
  return "⭐".repeat(n) + "☆".repeat(5 - n);
}

function ratingColor(avg) {
  if (avg >= 4.5) return 0x57F287;
  if (avg >= 3)   return 0xFEE75C;
  return 0xED4245;
}

// ── /vouch ────────────────────────────────────────────────────────────────────
const vouchData = new SlashCommandBuilder()
  .setName("vouch")
  .setDescription("Submit a vouch for a seller")
  .addUserOption(o => o.setName("seller").setDescription("Who are you vouching?").setRequired(true))
  .addIntegerOption(o => o.setName("rating").setDescription("Rating (1-5 stars)").setRequired(true).setMinValue(1).setMaxValue(5))
  .addStringOption(o => o.setName("product").setDescription("Product or service purchased"))
  .addStringOption(o => o.setName("price").setDescription("Price paid"))
  .addStringOption(o => o.setName("note").setDescription("Your review note"))
  .addAttachmentOption(o => o.setName("proof").setDescription("Screenshot proof (optional)"));

async function executeVouch(interaction) {
  await interaction.deferReply({ flags: 64 });

  const seller  = interaction.options.getUser("seller");
  const rating  = interaction.options.getInteger("rating");
  const product = interaction.options.getString("product") || null;
  const price   = interaction.options.getString("price")   || null;
  const note    = interaction.options.getString("note")    || "";
  const proof   = interaction.options.getAttachment("proof");
  const cfg     = await getGuildConfig(interaction.guild.id);

  if (seller.id === interaction.user.id) {
    return interaction.editReply({ content: "❌ You cannot vouch yourself." });
  }
  if (seller.bot) {
    return interaction.editReply({ content: "❌ You cannot vouch a bot." });
  }

  const vouchId = uuidv4().split("-")[0].toUpperCase();
  const vouch = await Vouch.create({
    vouchId,
    guildId:  interaction.guild.id,
    sellerId: seller.id,
    buyerId:  interaction.user.id,
    buyerTag: interaction.user.tag,
    product, price, rating, note,
    imageUrl: proof?.url || null,
  });

  // Post to vouch channel
  const vouchChannelId = cfg.vouchChannelId;
  if (vouchChannelId) {
    const vouchChannel = interaction.guild.channels.cache.get(vouchChannelId);
    if (vouchChannel) {
      const container = new ContainerBuilder()
        .setAccentColor(ratingColor(rating))
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `## ${stars(rating)} Vouch — ${seller.username}`
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            [
              `👤 **Seller:** <@${seller.id}>`,
              `🛒 **Buyer:** <@${interaction.user.id}>`,
              product ? `📦 **Product:** ${product}` : null,
              price   ? `💰 **Price:** ${price}` : null,
              note    ? `📝 **Note:** ${note}` : null,
            ].filter(Boolean).join("\n")
          )
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `-# Vouch ID: \`${vouchId}\` • <t:${Math.floor(Date.now() / 1000)}:R>`
          )
        );

      const msg = await vouchChannel.send({
        components: [container],
        flags: MessageFlags.IsComponentsV2,
      });

      vouch.messageId = msg.id;
      await vouch.save();
    }
  }

  // Count seller's vouches
  const total = await Vouch.countDocuments({ guildId: interaction.guild.id, sellerId: seller.id, removed: false });

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(ratingColor(rating))
        .setTitle("✅ Vouch Submitted")
        .setDescription(`Your ${stars(rating)} vouch for **${seller.tag}** has been recorded!\n**Total vouches:** ${total}`)
        .setFooter({ text: `Vouch ID: ${vouchId}` })
        .setTimestamp(),
    ],
  });
}

// ── /profile ──────────────────────────────────────────────────────────────────
const profileData = new SlashCommandBuilder()
  .setName("profile")
  .setDescription("View a seller's vouch profile")
  .addUserOption(o => o.setName("seller").setDescription("Seller to view (default: yourself)"));

async function executeProfile(interaction) {
  await interaction.deferReply({ flags: 64 });

  const seller  = interaction.options.getUser("seller") || interaction.user;
  const guildId = interaction.guild.id;

  const vouches = await Vouch.find({ guildId, sellerId: seller.id, removed: false }).sort({ createdAt: -1 });
  const total   = vouches.length;

  if (!total) {
    return interaction.editReply({ content: `**${seller.tag}** has no vouches yet.` });
  }

  const avgRating = (vouches.reduce((s, v) => s + v.rating, 0) / total).toFixed(2);
  const breakdown = [5,4,3,2,1].map(r => {
    const count = vouches.filter(v => v.rating === r).length;
    return `${stars(r)}: **${count}**`;
  }).join(" · ");

  const recent = vouches.slice(0, 5).map(v =>
    `${stars(v.rating)} — <@${v.buyerId}>${v.note ? ` — *${v.note.slice(0, 60)}*` : ""} (<t:${Math.floor(v.createdAt / 1000)}:R>)`
  ).join("\n");

  const container = new ContainerBuilder()
    .setAccentColor(ratingColor(parseFloat(avgRating)))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `# ${seller.username} — Vouch Profile`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `⭐ **Average Rating:** ${avgRating}/5  ${stars(Math.round(parseFloat(avgRating)))}`,
          `📊 **Total Vouches:** ${total}`,
          "",
          `**Rating Breakdown:**`,
          breakdown,
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `**Recent Vouches:**\n${recent}`
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Nexora Vouch System • <t:${Math.floor(Date.now() / 1000)}:R>`
      )
    );

  return interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ── /stats ────────────────────────────────────────────────────────────────────
const statsData = new SlashCommandBuilder()
  .setName("vouchstats")
  .setDescription("View server-wide vouch statistics");

async function executeStats(interaction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guild.id;
  const total   = await Vouch.countDocuments({ guildId, removed: false });
  const sellers = await Vouch.distinct("sellerId", { guildId, removed: false });

  const agg = await Vouch.aggregate([
    { $match: { guildId, removed: false } },
    { $group: { _id: null, avg: { $avg: "$rating" }, sum: { $sum: "$rating" } } },
  ]);

  const avg = agg[0]?.avg?.toFixed(2) || "0.00";

  const container = new ContainerBuilder()
    .setAccentColor(0x9B59B6)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 📊 ${interaction.guild.name} — Vouch Stats`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `📝 **Total Vouches:** ${total}`,
          `👤 **Unique Sellers:** ${sellers.length}`,
          `⭐ **Average Rating:** ${avg}/5`,
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Nexora Vouch System`)
    );

  return interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ── /leaderboard ──────────────────────────────────────────────────────────────
const leaderboardData = new SlashCommandBuilder()
  .setName("leaderboard")
  .setDescription("Top 10 sellers by vouch count");

async function executeLeaderboard(interaction) {
  await interaction.deferReply({ flags: 64 });

  const guildId = interaction.guild.id;

  const top = await Vouch.aggregate([
    { $match: { guildId, removed: false } },
    { $group: { _id: "$sellerId", count: { $sum: 1 }, avgRating: { $avg: "$rating" } } },
    { $sort: { count: -1 } },
    { $limit: 10 },
  ]);

  if (!top.length) {
    return interaction.editReply({ content: "No vouches yet on this server." });
  }

  const medals = ["🥇","🥈","🥉"];
  const lines = top.map((t, i) =>
    `${medals[i] || `**${i+1}.**`} <@${t._id}> — **${t.count}** vouches · ${t.avgRating.toFixed(1)}⭐`
  ).join("\n");

  const container = new ContainerBuilder()
    .setAccentColor(0xFEE75C)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🏆 Vouch Leaderboard — ${interaction.guild.name}`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(lines))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`-# Top 10 sellers by vouch count`)
    );

  return interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}

// ── /removevouch ──────────────────────────────────────────────────────────────
const removeVouchData = new SlashCommandBuilder()
  .setName("removevouch")
  .setDescription("Remove a vouch (staff only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addStringOption(o => o.setName("id").setDescription("Vouch ID").setRequired(true))
  .addStringOption(o => o.setName("reason").setDescription("Reason for removal"));

async function executeRemoveVouch(interaction) {
  await interaction.deferReply({ flags: 64 });

  const vouchId = interaction.options.getString("id").toUpperCase();
  const reason  = interaction.options.getString("reason") || "No reason provided";
  const vouch   = await Vouch.findOne({ vouchId, guildId: interaction.guild.id });

  if (!vouch) {
    return interaction.editReply({ content: `❌ Vouch \`${vouchId}\` not found.` });
  }

  vouch.removed       = true;
  vouch.removedBy     = interaction.user.id;
  vouch.removedReason = reason;
  await vouch.save();

  // Delete the message from vouch channel
  const cfg = await getGuildConfig(interaction.guild.id);
  if (cfg.vouchChannelId && vouch.messageId) {
    try {
      const ch  = interaction.guild.channels.cache.get(cfg.vouchChannelId);
      const msg = await ch?.messages.fetch(vouch.messageId);
      await msg?.delete();
    } catch {}
  }

  return interaction.editReply({ content: `✅ Vouch \`${vouchId}\` removed.\n**Reason:** ${reason}` });
}

// ── /vouchsetup ───────────────────────────────────────────────────────────────
const vouchSetupData = new SlashCommandBuilder()
  .setName("vouchsetup")
  .setDescription("Configure vouch system")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(o => o.setName("channel").setDescription("Channel where vouches are posted").setRequired(true));

async function executeVouchSetup(interaction) {
  await interaction.deferReply({ flags: 64 });
  const ch = interaction.options.getChannel("channel");
  await updateGuildConfig(interaction.guild.id, { vouchChannelId: ch.id });
  return interaction.editReply({ content: `✅ Vouch channel set to ${ch}` });
}

module.exports = {
  data:    vouchData,
  execute: executeVouch,
  profile:     { data: profileData,     execute: executeProfile     },
  vouchstats:  { data: statsData,       execute: executeStats       },
  leaderboard: { data: leaderboardData, execute: executeLeaderboard },
  removevouch: { data: removeVouchData, execute: executeRemoveVouch },
  vouchsetup:  { data: vouchSetupData,  execute: executeVouchSetup  },
};

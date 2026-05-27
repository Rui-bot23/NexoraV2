/**
 * /nexora — Bot info, stats, and admin utilities
 */

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require("discord.js");
const { License, Product, Ticket, Review } = require("../../models");
const { getConfig } = require("../../utils/config");
const { getGuildConfig } = require("../../utils/guildConfig");
const { infoEmbed, successEmbed, errorEmbed, hex } = require("../../utils/embeds");
const os = require("os");

const data = new SlashCommandBuilder()
  .setName("nexora")
  .setDescription("Nexora bot info and admin utilities")

  .addSubcommand(sub => sub.setName("stats").setDescription("View bot and database statistics"))
  .addSubcommand(sub => sub.setName("ping").setDescription("Check bot latency"))
  .addSubcommand(sub =>
    sub.setName("lookup")
      .setDescription("Look up a user's licenses and tickets")
      .addUserOption(o => o.setName("user").setDescription("User to look up").setRequired(true))
  );

function isDevOrAdmin(interaction) {
  const cfg = getConfig();
  if (interaction.user.id === cfg.developer?.id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === "stats")  return await handleStats(interaction);
    if (sub === "ping")   return await handlePing(interaction);
    if (sub === "lookup") return await handleLookup(interaction);
  } catch (err) {
    console.error("[NEXORA CMD]", err);
    const payload = { embeds: [errorEmbed("Error", err.message)], ephemeral: true };
    return interaction.replied || interaction.deferred ? interaction.editReply(payload) : interaction.reply(payload);
  }
}

async function handleStats(interaction) {
  if (!isDevOrAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Admins only.")], ephemeral: true });
  }

  await interaction.deferReply();

  const cfg = getConfig();
  const guildCfg = await getGuildConfig(interaction.guild.id);
  const b = { name: guildCfg.brandName || "Nexora", footer: guildCfg.brandFooter || "Nexora" };

  const [licenses, products, tickets, reviews] = await Promise.all([
    License.countDocuments(),
    Product.countDocuments(),
    Ticket.countDocuments(),
    Review.countDocuments(),
  ]);

  const activeLicenses  = await License.countDocuments({ suspended: false, isUsed: true });
  const openTickets     = await Ticket.countDocuments({ status: "open" });

  const uptime = process.uptime();
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = Math.floor(uptime % 60);

  const embed = new EmbedBuilder()
    .setColor(parseInt((guildCfg.brandColor || '5865F2'), 16))
    .setTitle(`${b.name || "Nexora"} — Bot Statistics`)
    .addFields(
      { name: "🔑 Licenses",         value: `${licenses} total · ${activeLicenses} active`, inline: false },
      { name: "📦 Products",          value: `${products}`, inline: true },
      { name: "🎫 Tickets",           value: `${tickets} total · ${openTickets} open`,        inline: false },
      { name: "⭐ Reviews",           value: `${reviews}`,   inline: true },
      { name: "⏱️ Uptime",           value: `${h}h ${m}m ${s}s`, inline: true },
      { name: "🏓 Latency",          value: `${interaction.client.ws.ping}ms`, inline: true },
      { name: "🌐 Servers",          value: `${interaction.client.guilds.cache.size}`, inline: true },
      { name: "💾 Memory",           value: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB`, inline: true },
    )
    .setFooter({ text: b.footer || "Nexora" })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

async function handlePing(interaction) {
  const sent = await interaction.reply({ embeds: [infoEmbed("Pinging...", "Measuring latency...")], fetchReply: true });
  const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;

  return interaction.editReply({
    embeds: [
      successEmbed("Pong! 🏓", "Bot latency results:")
        .addFields(
          { name: "🏓 Roundtrip",  value: `${roundtrip}ms`,                           inline: true },
          { name: "💓 Heartbeat",  value: `${interaction.client.ws.ping}ms`,          inline: true },
        ),
    ],
  });
}

async function handleLookup(interaction) {
  if (!isDevOrAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Admins only.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const user = interaction.options.getUser("user");

  const [licenses, tickets, reviews] = await Promise.all([
    License.find({ createdBy: user.id }).sort({ createdAt: -1 }).limit(5),
    Ticket.find({ ownerId: user.id, guildId: interaction.guild.id }).sort({ createdAt: -1 }).limit(5),
    Review.find({ userId: user.id, guildId: interaction.guild.id }).sort({ createdAt: -1 }).limit(5),
  ]);

  const licLines = licenses.length
    ? licenses.map(l => `\`${l.licenseKey}\` — **${l.productName}**`).join("\n")
    : "*None found*";

  const tickLines = tickets.length
    ? tickets.map(t => `\`${t.ticketId}\` — ${t.category} — ${t.status}`).join("\n")
    : "*None found*";

  const revLines = reviews.length
    ? reviews.map(r => `\`${r.reviewId}\` — ${"⭐".repeat(r.rating)}`).join("\n")
    : "*None found*";

  const cfg = getConfig();
  const embed = new EmbedBuilder()
    .setColor(0x9B59B6)
    .setTitle(`User Lookup — ${user.tag}`)
    .setThumbnail(user.displayAvatarURL())
    .addFields(
      { name: `🔑 Licenses (${licenses.length})`, value: licLines,  inline: false },
      { name: `🎫 Tickets (${tickets.length})`,   value: tickLines, inline: false },
      { name: `⭐ Reviews (${reviews.length})`,   value: revLines,  inline: false },
    )
    .setFooter({ text: `ID: ${user.id}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

module.exports = { data, execute };

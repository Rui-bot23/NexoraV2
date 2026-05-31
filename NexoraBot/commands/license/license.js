/**
 * /license — Nexora License Management
 * Subcommands: create | info | list | delete | suspend | unsuspend | reset | transfer
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const dayjs = require("dayjs");
const { License, Product } = require("../../models");
const { getConfig } = require("../../utils/config");
const { getGuildConfig } = require("../../utils/guildConfig");
const { licenseEmbed, successEmbed, errorEmbed, infoEmbed, hex } = require("../../utils/embeds");

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateKey() {
  // NEXORA-XXXX-XXXX-XXXX-XXXX format
  const seg = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `NEXORA-${seg()}-${seg()}-${seg()}-${seg()}`;
}

function parseExpiry(durationStr) {
  // e.g. "30d", "1y", "6m", "lifetime"
  if (!durationStr || durationStr.toLowerCase() === "lifetime") return 0;
  const match = durationStr.match(/^(\d+)([dDmMyY])$/);
  if (!match) return null;
  const amount = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  const unitMap = { d: "day", m: "month", y: "year" };
  return dayjs().add(amount, unitMap[unit]).valueOf();
}

function formatExpiry(expiresAt, permanent) {
  if (permanent || expiresAt === 0) return "♾️ Lifetime";
  if (expiresAt < Date.now()) return "⛔ Expired";
  return `<t:${Math.floor(expiresAt / 1000)}:F>`;
}

function statusBadge(license) {
  if (license.suspended) return "🔴 Suspended";
  if (license.expiresAt > 0 && license.expiresAt < Date.now()) return "⛔ Expired";
  if (!license.isUsed) return "🟡 Unused";
  return "🟢 Active";
}

function isDevOrAdmin(interaction) {
  const cfg = getConfig();
  if (cfg.developer?.id && interaction.user.id === cfg.developer.id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

// ── Slash Command Builder ─────────────────────────────────────────────────────

const data = new SlashCommandBuilder()
  .setName("license")
  .setDescription("Manage Nexora licenses")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  // CREATE
  .addSubcommand(sub =>
    sub.setName("create")
      .setDescription("Create a new license key")
      .addStringOption(o => o.setName("product").setDescription("Product name").setRequired(true))
      .addStringOption(o => o.setName("duration").setDescription("Duration: 30d | 6m | 1y | lifetime").setRequired(true))
      .addStringOption(o => o.setName("description").setDescription("Optional description"))
      .addIntegerOption(o => o.setName("max_ip").setDescription("Max IP bindings (default: 1)").setMinValue(1).setMaxValue(10))
      .addIntegerOption(o => o.setName("max_hwid").setDescription("Max HWID bindings (default: 1)").setMinValue(1).setMaxValue(10))
  )

  // INFO
  .addSubcommand(sub =>
    sub.setName("info")
      .setDescription("Get info on a license key")
      .addStringOption(o => o.setName("key").setDescription("The license key").setRequired(true))
  )

  // LIST
  .addSubcommand(sub =>
    sub.setName("list")
      .setDescription("List licenses for a product")
      .addStringOption(o => o.setName("product").setDescription("Product name (leave blank for all)"))
      .addStringOption(o =>
        o.setName("filter")
          .setDescription("Filter by status")
          .addChoices(
            { name: "All", value: "all" },
            { name: "Active", value: "active" },
            { name: "Unused", value: "unused" },
            { name: "Suspended", value: "suspended" },
            { name: "Expired", value: "expired" }
          )
      )
  )

  // DELETE
  .addSubcommand(sub =>
    sub.setName("delete")
      .setDescription("Delete a license key permanently")
      .addStringOption(o => o.setName("key").setDescription("The license key").setRequired(true))
  )

  // SUSPEND / UNSUSPEND
  .addSubcommand(sub =>
    sub.setName("suspend")
      .setDescription("Suspend a license key")
      .addStringOption(o => o.setName("key").setDescription("The license key").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason for suspension"))
  )
  .addSubcommand(sub =>
    sub.setName("unsuspend")
      .setDescription("Unsuspend a license key")
      .addStringOption(o => o.setName("key").setDescription("The license key").setRequired(true))
  )

  // RESET (clears IP/HWID bindings)
  .addSubcommand(sub =>
    sub.setName("reset")
      .setDescription("Reset a license's IP and HWID bindings")
      .addStringOption(o => o.setName("key").setDescription("The license key").setRequired(true))
  )

  // EXTEND
  .addSubcommand(sub =>
    sub.setName("extend")
      .setDescription("Extend a license's expiry")
      .addStringOption(o => o.setName("key").setDescription("The license key").setRequired(true))
      .addStringOption(o => o.setName("duration").setDescription("Extra duration: 30d | 6m | 1y").setRequired(true))
  );

// ── Execute ───────────────────────────────────────────────────────────────────

async function execute(interaction) {
  if (!isDevOrAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "You need Administrator to manage licenses.")], ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === "create") return await handleCreate(interaction);
    if (sub === "info")   return await handleInfo(interaction);
    if (sub === "list")   return await handleList(interaction);
    if (sub === "delete") return await handleDelete(interaction);
    if (sub === "suspend")   return await handleSuspend(interaction, true);
    if (sub === "unsuspend") return await handleSuspend(interaction, false);
    if (sub === "reset")  return await handleReset(interaction);
    if (sub === "extend") return await handleExtend(interaction);
  } catch (err) {
    console.error("[LICENSE CMD]", err);
    return interaction.editReply({ embeds: [errorEmbed("Error", `Something went wrong: ${err.message}`)] });
  }
}

// ── Sub-handlers ─────────────────────────────────────────────────────────────

async function handleCreate(interaction) {
  const cfg = getConfig();
  const productName = interaction.options.getString("product");
  const durationStr = interaction.options.getString("duration");
  const description = interaction.options.getString("description") || "";
  const maxIp   = interaction.options.getInteger("max_ip") ?? (1);
  const maxHwId = interaction.options.getInteger("max_hwid") ?? (1);

  const expiresAt = parseExpiry(durationStr);
  if (expiresAt === null) {
    return interaction.editReply({ embeds: [errorEmbed("Invalid Duration", "Use formats like `30d`, `6m`, `1y`, or `lifetime`.")] });
  }

  const permanent = expiresAt === 0;
  const key = generateKey();

  const license = await License.create({
    licenseKey: key,
    productName,
    description,
    permanent,
    expiresAt,
    maxIp,
    maxHwId,
    createdBy: interaction.user.id,
  });

  const embed = licenseEmbed("License Created", `A new license key has been generated for **${productName}**.`)
    .addFields(
      { name: "🔑 License Key", value: `\`\`\`${key}\`\`\``, inline: false },
      { name: "📦 Product", value: productName, inline: true },
      { name: "⏳ Expires", value: formatExpiry(expiresAt, permanent), inline: true },
      { name: "🌐 Max IPs", value: `${maxIp}`, inline: true },
      { name: "🖥️ Max HWIDs", value: `${maxHwId}`, inline: true },
      { name: "📝 Description", value: description || "*None*", inline: false },
    )
    .setFooter({ text: `Created by ${interaction.user.tag}` });

  return interaction.editReply({ embeds: [embed] });
}

async function handleInfo(interaction) {
  const key = interaction.options.getString("key").trim().toUpperCase();
  const license = await License.findOne({ licenseKey: key });

  if (!license) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `No license found for key \`${key}\`.`)] });
  }

  const embed = licenseEmbed("License Info", `Details for key \`${license.licenseKey}\``)
    .addFields(
      { name: "📦 Product", value: license.productName, inline: true },
      { name: "🏷️ Status", value: statusBadge(license), inline: true },
      { name: "⏳ Expires", value: formatExpiry(license.expiresAt, license.permanent), inline: true },
      { name: "🌐 IPs Bound", value: `${license.ipArray.length} / ${license.maxIp}`, inline: true },
      { name: "🖥️ HWIDs Bound", value: `${license.hwidArray.length} / ${license.maxHwId}`, inline: true },
      { name: "📊 Total Requests", value: `${license.totalRequests}`, inline: true },
      { name: "📝 Description", value: license.description || "*None*", inline: false },
      { name: "📅 Created", value: `<t:${Math.floor(license.createdAt / 1000)}:F>`, inline: true },
    );

  if (license.isUsed && license.latestIp) {
    embed.addFields({ name: "🌐 Latest IP", value: `\`${license.latestIp}\``, inline: true });
  }

  // Redeem status
  if (license.redeemEnabled || license.redeemedBy) {
    const redeemStatus = license.redeemedBy
      ? `🟡 Redeemed by <@${license.redeemedBy}> <t:${Math.floor(license.redeemedAt / 1000)}:R>`
      : "🟢 Available to redeem";
    embed.addFields({ name: "🎟️ Redeem", value: redeemStatus, inline: false });
  }

  return interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction) {
  const productFilter = interaction.options.getString("product");
  const statusFilter  = interaction.options.getString("filter") || "all";

  const query = {};
  if (productFilter) query.productName = new RegExp(productFilter, "i");

  let licenses = await License.find(query).sort({ createdAt: -1 }).limit(25);

  // Client-side status filtering
  const now = Date.now();
  if (statusFilter === "active")    licenses = licenses.filter(l => !l.suspended && l.isUsed && (l.expiresAt === 0 || l.expiresAt > now));
  if (statusFilter === "unused")    licenses = licenses.filter(l => !l.isUsed);
  if (statusFilter === "suspended") licenses = licenses.filter(l => l.suspended);
  if (statusFilter === "expired")   licenses = licenses.filter(l => l.expiresAt > 0 && l.expiresAt < now);

  if (!licenses.length) {
    return interaction.editReply({ embeds: [infoEmbed("No Licenses", "No licenses matched your query.")] });
  }

  const rows = licenses.map(l =>
    `\`${l.licenseKey}\` — **${l.productName}** — ${statusBadge(l)}`
  ).join("\n");

  const embed = infoEmbed(`Licenses (${licenses.length})`, rows)
    .setFooter({ text: "Showing up to 25 results" });

  return interaction.editReply({ embeds: [embed] });
}

async function handleDelete(interaction) {
  const key = interaction.options.getString("key").trim().toUpperCase();
  const license = await License.findOneAndDelete({ licenseKey: key });

  if (!license) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `No license found for key \`${key}\`.`)] });
  }

  return interaction.editReply({
    embeds: [successEmbed("License Deleted", `License \`${key}\` for **${license.productName}** has been permanently deleted.`)],
  });
}

async function handleSuspend(interaction, suspend) {
  const key = interaction.options.getString("key").trim().toUpperCase();
  const reason = interaction.options.getString("reason") || "No reason provided";

  const license = await License.findOne({ licenseKey: key });
  if (!license) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `No license found for key \`${key}\`.`)] });
  }

  license.suspended = suspend;
  await license.save();

  const action = suspend ? "Suspended" : "Unsuspended";
  const emoji = suspend ? "🔴" : "🟢";
  return interaction.editReply({
    embeds: [
      (suspend ? errorEmbed : successEmbed)(`License ${action}`, `${emoji} License \`${key}\` has been **${action.toLowerCase()}**.\n**Reason:** ${reason}`),
    ],
  });
}

async function handleReset(interaction) {
  const key = interaction.options.getString("key").trim().toUpperCase();
  const license = await License.findOne({ licenseKey: key });

  if (!license) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `No license found for key \`${key}\`.`)] });
  }

  license.ipArray   = [];
  license.hwidArray = [];
  license.latestIp  = null;
  license.latestHwId = null;
  license.attempts  = 0;
  license.reset     = true;
  await license.save();

  return interaction.editReply({
    embeds: [successEmbed("License Reset", `IP and HWID bindings for \`${key}\` have been cleared.`)],
  });
}

async function handleExtend(interaction) {
  const key = interaction.options.getString("key").trim().toUpperCase();
  const durationStr = interaction.options.getString("duration");

  const license = await License.findOne({ licenseKey: key });
  if (!license) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `No license found for key \`${key}\`.`)] });
  }

  if (license.permanent || license.expiresAt === 0) {
    return interaction.editReply({ embeds: [errorEmbed("Lifetime License", "This is a lifetime license and cannot be extended.")] });
  }

  const match = durationStr.match(/^(\d+)([dDmMyY])$/);
  if (!match) {
    return interaction.editReply({ embeds: [errorEmbed("Invalid Duration", "Use formats like `30d`, `6m`, or `1y`.")] });
  }

  const amount = parseInt(match[1]);
  const unit   = match[2].toLowerCase();
  const unitMap = { d: "day", m: "month", y: "year" };

  const base = Math.max(license.expiresAt, Date.now());
  license.expiresAt = dayjs(base).add(amount, unitMap[unit]).valueOf();
  await license.save();

  return interaction.editReply({
    embeds: [successEmbed("License Extended", `\`${key}\` now expires on ${formatExpiry(license.expiresAt, false)}`)],
  });
}

module.exports = { data, execute };

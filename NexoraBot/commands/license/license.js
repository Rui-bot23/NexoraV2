/**
 * /license — Nexora License Management
 * create | batch | edit | info | list | delete | suspend | unsuspend | reset | extend
 * All key fields have autocomplete
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const dayjs  = require("dayjs");
const { License, Product } = require("../../models");
const { getConfig } = require("../../utils/config");
const { licenseEmbed, successEmbed, errorEmbed, infoEmbed } = require("../../utils/embeds");

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateKey() {
  const seg = () => Math.random().toString(36).substring(2, 6).toUpperCase();
  return `NEXORA-${seg()}-${seg()}-${seg()}-${seg()}`;
}

function parseExpiry(str) {
  if (!str || str.toLowerCase() === "lifetime") return 0;
  const match = str.match(/^(\d+)([dDmMyY])$/);
  if (!match) return null;
  const map = { d: "day", m: "month", y: "year" };
  return dayjs().add(parseInt(match[1]), map[match[2].toLowerCase()]).valueOf();
}

function formatExpiry(expiresAt, permanent) {
  if (permanent || expiresAt === 0) return "♾️ Lifetime";
  if (expiresAt < Date.now()) return "⛔ Expired";
  return `<t:${Math.floor(expiresAt / 1000)}:F>`;
}

function statusBadge(l) {
  if (l.suspended) return "🔴 Suspended";
  if (l.expiresAt > 0 && l.expiresAt < Date.now()) return "⛔ Expired";
  if (!l.isUsed) return "🟡 Unused";
  return "🟢 Active";
}

function isAdmin(interaction) {
  const cfg = getConfig();
  if (cfg.developer?.id && interaction.user.id === cfg.developer.id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── Command Builder ───────────────────────────────────────────────────────────
const data = new SlashCommandBuilder()
  .setName("license")
  .setDescription("Manage Nexora licenses")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  .addSubcommand(s => s.setName("create")
    .setDescription("Create a single license key")
    .addStringOption(o => o.setName("product").setDescription("Product name").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("30d | 6m | 1y | lifetime").setRequired(true))
    .addStringOption(o => o.setName("description").setDescription("Optional description"))
    .addIntegerOption(o => o.setName("max_ip").setDescription("Max IPs (default: 1)").setMinValue(1).setMaxValue(10))
    .addIntegerOption(o => o.setName("max_hwid").setDescription("Max HWIDs (default: 1)").setMinValue(1).setMaxValue(10))
  )

  .addSubcommand(s => s.setName("batch")
    .setDescription("Create multiple license keys at once")
    .addStringOption(o => o.setName("product").setDescription("Product name").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("30d | 6m | 1y | lifetime").setRequired(true))
    .addIntegerOption(o => o.setName("count").setDescription("How many keys to generate (1-50)").setRequired(true).setMinValue(1).setMaxValue(50))
    .addIntegerOption(o => o.setName("max_ip").setDescription("Max IPs per key (default: 1)").setMinValue(1).setMaxValue(10))
    .addIntegerOption(o => o.setName("max_hwid").setDescription("Max HWIDs per key (default: 1)").setMinValue(1).setMaxValue(10))
  )

  .addSubcommand(s => s.setName("edit")
    .setDescription("Edit a license key's settings")
    .addStringOption(o => o.setName("key").setDescription("License key").setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName("product").setDescription("New product name"))
    .addStringOption(o => o.setName("description").setDescription("New description"))
    .addStringOption(o => o.setName("duration").setDescription("New expiry: 30d | 6m | 1y | lifetime"))
    .addIntegerOption(o => o.setName("max_ip").setDescription("New max IPs").setMinValue(1).setMaxValue(10))
    .addIntegerOption(o => o.setName("max_hwid").setDescription("New max HWIDs").setMinValue(1).setMaxValue(10))
  )

  .addSubcommand(s => s.setName("info")
    .setDescription("View license details")
    .addStringOption(o => o.setName("key").setDescription("License key").setRequired(true).setAutocomplete(true))
  )

  .addSubcommand(s => s.setName("list")
    .setDescription("List licenses")
    .addStringOption(o => o.setName("product").setDescription("Filter by product"))
    .addStringOption(o => o.setName("filter").setDescription("Filter by status")
      .addChoices(
        { name: "All",       value: "all"       },
        { name: "Active",    value: "active"    },
        { name: "Unused",    value: "unused"    },
        { name: "Suspended", value: "suspended" },
        { name: "Expired",   value: "expired"   },
      )
    )
  )

  .addSubcommand(s => s.setName("delete")
    .setDescription("Delete a license key permanently")
    .addStringOption(o => o.setName("key").setDescription("License key").setRequired(true).setAutocomplete(true))
  )

  .addSubcommand(s => s.setName("suspend")
    .setDescription("Suspend a license key")
    .addStringOption(o => o.setName("key").setDescription("License key").setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName("reason").setDescription("Reason"))
  )

  .addSubcommand(s => s.setName("unsuspend")
    .setDescription("Unsuspend a license key")
    .addStringOption(o => o.setName("key").setDescription("License key").setRequired(true).setAutocomplete(true))
  )

  .addSubcommand(s => s.setName("reset")
    .setDescription("Reset IP and HWID bindings")
    .addStringOption(o => o.setName("key").setDescription("License key").setRequired(true).setAutocomplete(true))
  )

  .addSubcommand(s => s.setName("extend")
    .setDescription("Extend a license's expiry")
    .addStringOption(o => o.setName("key").setDescription("License key").setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName("duration").setDescription("Extra duration: 30d | 6m | 1y").setRequired(true))
  );

// ── Autocomplete ──────────────────────────────────────────────────────────────
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toUpperCase();
  const licenses = await License.find(
    focused ? { licenseKey: new RegExp(focused, "i") } : {}
  ).limit(25);

  await interaction.respond(
    licenses.map(l => ({
      name: `${l.licenseKey} — ${l.productName} (${statusBadge(l)})`,
      value: l.licenseKey,
    }))
  );
}

// ── Execute ───────────────────────────────────────────────────────────────────
async function execute(interaction) {
  if (!isAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "You need Administrator.")], flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === "create")    return await handleCreate(interaction);
    if (sub === "batch")     return await handleBatch(interaction);
    if (sub === "edit")      return await handleEdit(interaction);
    if (sub === "info")      return await handleInfo(interaction);
    if (sub === "list")      return await handleList(interaction);
    if (sub === "delete")    return await handleDelete(interaction);
    if (sub === "suspend")   return await handleSuspend(interaction, true);
    if (sub === "unsuspend") return await handleSuspend(interaction, false);
    if (sub === "reset")     return await handleReset(interaction);
    if (sub === "extend")    return await handleExtend(interaction);
  } catch (err) {
    console.error("[LICENSE]", err);
    return interaction.editReply({ embeds: [errorEmbed("Error", err.message)] });
  }
}

// ── Create ────────────────────────────────────────────────────────────────────
async function handleCreate(interaction) {
  const productName = interaction.options.getString("product");
  const durationStr = interaction.options.getString("duration");
  const description = interaction.options.getString("description") || "";
  const maxIp       = interaction.options.getInteger("max_ip")   ?? 1;
  const maxHwId     = interaction.options.getInteger("max_hwid") ?? 1;
  const expiresAt   = parseExpiry(durationStr);

  if (expiresAt === null) return interaction.editReply({ embeds: [errorEmbed("Invalid Duration", "Use: `30d`, `6m`, `1y`, `lifetime`")] });

  const key = generateKey();
  await License.create({ licenseKey: key, productName, description, permanent: expiresAt === 0, expiresAt, maxIp, maxHwId, createdBy: interaction.user.id });

  return interaction.editReply({
    embeds: [
      licenseEmbed("✅ License Created", `Key generated for **${productName}**`)
        .addFields(
          { name: "🔑 Key",        value: `\`\`\`${key}\`\`\``,                  inline: false },
          { name: "📦 Product",    value: productName,                            inline: true  },
          { name: "⏳ Expires",    value: formatExpiry(expiresAt, expiresAt===0), inline: true  },
          { name: "🌐 Max IPs",    value: `${maxIp}`,                             inline: true  },
          { name: "🖥️ Max HWIDs", value: `${maxHwId}`,                           inline: true  },
          { name: "📝 Description",value: description || "*None*",                inline: false },
        )
        .setFooter({ text: `Created by ${interaction.user.tag}` }),
    ],
  });
}

// ── Batch ─────────────────────────────────────────────────────────────────────
async function handleBatch(interaction) {
  const productName = interaction.options.getString("product");
  const durationStr = interaction.options.getString("duration");
  const count       = interaction.options.getInteger("count");
  const maxIp       = interaction.options.getInteger("max_ip")   ?? 1;
  const maxHwId     = interaction.options.getInteger("max_hwid") ?? 1;
  const expiresAt   = parseExpiry(durationStr);

  if (expiresAt === null) return interaction.editReply({ embeds: [errorEmbed("Invalid Duration", "Use: `30d`, `6m`, `1y`, `lifetime`")] });

  const permanent = expiresAt === 0;
  const keys = [];

  for (let i = 0; i < count; i++) {
    const key = generateKey();
    keys.push(key);
    await License.create({ licenseKey: key, productName, permanent, expiresAt, maxIp, maxHwId, createdBy: interaction.user.id });
  }

  const keyList = keys.map(k => `\`${k}\``).join("\n");

  // Send as file if too many
  if (count > 10) {
    const { AttachmentBuilder } = require("discord.js");
    const content = keys.join("\n");
    const file    = new AttachmentBuilder(Buffer.from(content), { name: `${productName}-keys.txt` });
    return interaction.editReply({
      content: `✅ Generated **${count}** license keys for **${productName}**.`,
      files: [file],
    });
  }

  return interaction.editReply({
    embeds: [
      licenseEmbed(`✅ ${count} Licenses Created`, `Batch generated for **${productName}**`)
        .addFields(
          { name: "🔑 Keys", value: keyList, inline: false },
          { name: "⏳ Expires", value: formatExpiry(expiresAt, permanent), inline: true },
          { name: "🌐 Max IPs", value: `${maxIp}`, inline: true },
          { name: "🖥️ Max HWIDs", value: `${maxHwId}`, inline: true },
        )
        .setFooter({ text: `Created by ${interaction.user.tag}` }),
    ],
  });
}

// ── Edit ──────────────────────────────────────────────────────────────────────
async function handleEdit(interaction) {
  const key = interaction.options.getString("key").trim().toUpperCase();
  const license = await License.findOne({ licenseKey: key });

  if (!license) return interaction.editReply({ embeds: [errorEmbed("Not Found", `No license for \`${key}\``)] });

  const product     = interaction.options.getString("product");
  const description = interaction.options.getString("description");
  const durationStr = interaction.options.getString("duration");
  const maxIp       = interaction.options.getInteger("max_ip");
  const maxHwId     = interaction.options.getInteger("max_hwid");

  if (!product && !description && !durationStr && maxIp === null && maxHwId === null) {
    return interaction.editReply({ embeds: [errorEmbed("Nothing to Edit", "Provide at least one field to change.")] });
  }

  const changes = [];
  if (product)     { license.productName = product; changes.push(`Product → ${product}`); }
  if (description) { license.description = description; changes.push(`Description → ${description}`); }
  if (maxIp !== null)   { license.maxIp   = maxIp;   changes.push(`Max IPs → ${maxIp}`); }
  if (maxHwId !== null) { license.maxHwId = maxHwId; changes.push(`Max HWIDs → ${maxHwId}`); }

  if (durationStr) {
    const exp = parseExpiry(durationStr);
    if (exp === null) return interaction.editReply({ embeds: [errorEmbed("Invalid Duration", "Use: `30d`, `6m`, `1y`, `lifetime`")] });
    license.expiresAt = exp;
    license.permanent = exp === 0;
    changes.push(`Expiry → ${formatExpiry(exp, exp === 0)}`);
  }

  await license.save();

  return interaction.editReply({
    embeds: [
      successEmbed("✅ License Updated", `Changes to \`${key}\`:\n${changes.map(c => `• ${c}`).join("\n")}`),
    ],
  });
}

// ── Info ──────────────────────────────────────────────────────────────────────
async function handleInfo(interaction) {
  const key = interaction.options.getString("key").trim().toUpperCase();
  const license = await License.findOne({ licenseKey: key });

  if (!license) return interaction.editReply({ embeds: [errorEmbed("Not Found", `No license for \`${key}\``)] });

  const embed = licenseEmbed("License Info", `\`${license.licenseKey}\``)
    .addFields(
      { name: "📦 Product",       value: license.productName,                             inline: true  },
      { name: "🏷️ Status",       value: statusBadge(license),                            inline: true  },
      { name: "⏳ Expires",       value: formatExpiry(license.expiresAt, license.permanent), inline: true },
      { name: "🌐 IPs",           value: `${license.ipArray?.length || 0} / ${license.maxIp}`,  inline: true },
      { name: "🖥️ HWIDs",        value: `${license.hwidArray?.length || 0} / ${license.maxHwId}`, inline: true },
      { name: "📊 Requests",      value: `${license.totalRequests || 0}`,                 inline: true  },
      { name: "📝 Description",   value: license.description || "*None*",                 inline: false },
      { name: "📅 Created",       value: `<t:${Math.floor(license.createdAt / 1000)}:F>`, inline: true  },
    );

  if (license.latestIp) embed.addFields({ name: "🌐 Latest IP", value: `\`${license.latestIp}\``, inline: true });

  if (license.redeemEnabled || license.redeemedBy) {
    embed.addFields({
      name: "🎟️ Redeem",
      value: license.redeemedBy
        ? `🟡 Redeemed by <@${license.redeemedBy}> <t:${Math.floor(license.redeemedAt / 1000)}:R>`
        : "🟢 Available to redeem",
      inline: false,
    });
  }

  return interaction.editReply({ embeds: [embed] });
}

// ── List ──────────────────────────────────────────────────────────────────────
async function handleList(interaction) {
  const productFilter = interaction.options.getString("product");
  const statusFilter  = interaction.options.getString("filter") || "all";

  const query = {};
  if (productFilter) query.productName = new RegExp(escapeRegex(productFilter), "i");

  let licenses = await License.find(query).sort({ createdAt: -1 }).limit(25);
  const now = Date.now();
  if (statusFilter === "active")    licenses = licenses.filter(l => !l.suspended && l.isUsed && (!l.expiresAt || l.expiresAt > now));
  if (statusFilter === "unused")    licenses = licenses.filter(l => !l.isUsed);
  if (statusFilter === "suspended") licenses = licenses.filter(l => l.suspended);
  if (statusFilter === "expired")   licenses = licenses.filter(l => l.expiresAt > 0 && l.expiresAt < now);

  if (!licenses.length) return interaction.editReply({ embeds: [infoEmbed("No Results", "No licenses matched.")] });

  const rows = licenses.map(l => `\`${l.licenseKey}\` — **${l.productName}** — ${statusBadge(l)}`).join("\n");
  return interaction.editReply({ embeds: [infoEmbed(`Licenses (${licenses.length})`, rows).setFooter({ text: "Showing up to 25" })] });
}

// ── Delete ────────────────────────────────────────────────────────────────────
async function handleDelete(interaction) {
  const key = interaction.options.getString("key").trim().toUpperCase();
  const license = await License.findOneAndDelete({ licenseKey: key });
  if (!license) return interaction.editReply({ embeds: [errorEmbed("Not Found", `\`${key}\` not found`)] });
  return interaction.editReply({ embeds: [successEmbed("Deleted", `\`${key}\` permanently deleted.`)] });
}

// ── Suspend ───────────────────────────────────────────────────────────────────
async function handleSuspend(interaction, suspend) {
  const key    = interaction.options.getString("key").trim().toUpperCase();
  const reason = interaction.options.getString("reason") || "No reason";
  const license = await License.findOne({ licenseKey: key });
  if (!license) return interaction.editReply({ embeds: [errorEmbed("Not Found", `\`${key}\` not found`)] });
  license.suspended = suspend;
  await license.save();
  const fn = suspend ? errorEmbed : successEmbed;
  return interaction.editReply({ embeds: [fn(`${suspend?"🔴 Suspended":"🟢 Unsuspended"}`, `\`${key}\`\n**Reason:** ${reason}`)] });
}

// ── Reset ─────────────────────────────────────────────────────────────────────
async function handleReset(interaction) {
  const key = interaction.options.getString("key").trim().toUpperCase();
  const license = await License.findOne({ licenseKey: key });
  if (!license) return interaction.editReply({ embeds: [errorEmbed("Not Found", `\`${key}\` not found`)] });
  license.ipArray = []; license.hwidArray = []; license.latestIp = null; license.attempts = 0;
  await license.save();
  return interaction.editReply({ embeds: [successEmbed("Reset", `IP and HWID bindings cleared for \`${key}\`.`)] });
}

// ── Extend ────────────────────────────────────────────────────────────────────
async function handleExtend(interaction) {
  const key    = interaction.options.getString("key").trim().toUpperCase();
  const durStr = interaction.options.getString("duration");
  const license = await License.findOne({ licenseKey: key });
  if (!license) return interaction.editReply({ embeds: [errorEmbed("Not Found", `\`${key}\` not found`)] });
  if (license.permanent || license.expiresAt === 0) return interaction.editReply({ embeds: [errorEmbed("Lifetime", "Lifetime licenses cannot be extended.")] });

  const match = durStr.match(/^(\d+)([dDmMyY])$/);
  if (!match) return interaction.editReply({ embeds: [errorEmbed("Invalid", "Use: `30d`, `6m`, `1y`")] });
  const map = { d: "day", m: "month", y: "year" };
  license.expiresAt = dayjs(Math.max(license.expiresAt, Date.now())).add(parseInt(match[1]), map[match[2].toLowerCase()]).valueOf();
  await license.save();
  return interaction.editReply({ embeds: [successEmbed("Extended", `\`${key}\` now expires ${formatExpiry(license.expiresAt, false)}`)] });
}

module.exports = { data, execute, autocomplete };

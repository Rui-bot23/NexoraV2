/**
 * /blacklist — Nexora Blacklist Management
 * Subcommands: add | remove | list | check
 */

const { SlashCommandBuilder, PermissionFlagsBits } = require("discord.js");
const { Blacklist } = require("../../models");
const { getConfig } = require("../../utils/config");
const { successEmbed, errorEmbed, infoEmbed, warningEmbed } = require("../../utils/embeds");

function isDevOrAdmin(interaction) {
  const cfg = getConfig();
  if (interaction.user.id === cfg.developer?.id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

const data = new SlashCommandBuilder()
  .setName("blacklist")
  .setDescription("Manage the Nexora blacklist")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  .addSubcommand(sub =>
    sub.setName("add")
      .setDescription("Blacklist a user, IP, or HWID")
      .addStringOption(o =>
        o.setName("type").setDescription("Type of blacklist entry").setRequired(true)
          .addChoices(
            { name: "User (Discord ID)", value: "user" },
            { name: "IP Address", value: "ip" },
            { name: "Hardware ID", value: "hwid" }
          )
      )
      .addStringOption(o => o.setName("value").setDescription("The value to blacklist").setRequired(true))
      .addStringOption(o => o.setName("reason").setDescription("Reason for blacklisting"))
  )
  .addSubcommand(sub =>
    sub.setName("remove")
      .setDescription("Remove a blacklist entry")
      .addStringOption(o => o.setName("value").setDescription("The value to unblacklist").setRequired(true))
  )
  .addSubcommand(sub =>
    sub.setName("list")
      .setDescription("List all blacklist entries")
      .addStringOption(o =>
        o.setName("type").setDescription("Filter by type")
          .addChoices(
            { name: "All", value: "all" },
            { name: "User", value: "user" },
            { name: "IP", value: "ip" },
            { name: "HWID", value: "hwid" }
          )
      )
  )
  .addSubcommand(sub =>
    sub.setName("check")
      .setDescription("Check if a value is blacklisted")
      .addStringOption(o => o.setName("value").setDescription("The value to check").setRequired(true))
  );

async function execute(interaction) {
  if (!isDevOrAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "You need Administrator to manage the blacklist.")], ephemeral: true });
  }

  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === "add")    return await handleAdd(interaction);
    if (sub === "remove") return await handleRemove(interaction);
    if (sub === "list")   return await handleList(interaction);
    if (sub === "check")  return await handleCheck(interaction);
  } catch (err) {
    console.error("[BLACKLIST CMD]", err);
    return interaction.editReply({ embeds: [errorEmbed("Error", err.message)] });
  }
}

async function handleAdd(interaction) {
  const type   = interaction.options.getString("type");
  const value  = interaction.options.getString("value").trim();
  const reason = interaction.options.getString("reason") || "No reason provided";

  const existing = await Blacklist.findOne({ value });
  if (existing) {
    return interaction.editReply({ embeds: [warningEmbed("Already Blacklisted", `\`${value}\` is already in the blacklist as **${existing.type}**.`)] });
  }

  await Blacklist.create({ type, value, reason, createdBy: interaction.user.id });

  return interaction.editReply({
    embeds: [
      errorEmbed("Entry Blacklisted", `\`${value}\` has been added to the blacklist.`)
        .addFields(
          { name: "Type",   value: type,   inline: true },
          { name: "Reason", value: reason, inline: true },
        ),
    ],
  });
}

async function handleRemove(interaction) {
  const value = interaction.options.getString("value").trim();
  const entry = await Blacklist.findOneAndDelete({ value });

  if (!entry) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `\`${value}\` is not in the blacklist.`)] });
  }

  return interaction.editReply({
    embeds: [successEmbed("Entry Removed", `\`${value}\` has been removed from the blacklist.`)],
  });
}

async function handleList(interaction) {
  const typeFilter = interaction.options.getString("type") || "all";
  const query = typeFilter !== "all" ? { type: typeFilter } : {};
  const entries = await Blacklist.find(query).sort({ createdAt: -1 }).limit(30);

  if (!entries.length) {
    return interaction.editReply({ embeds: [infoEmbed("Blacklist Empty", "No entries found.")] });
  }

  const typeEmoji = { user: "👤", ip: "🌐", hwid: "🖥️" };
  const lines = entries.map(e => `${typeEmoji[e.type] || "•"} \`${e.value}\` — *${e.reason}*`);

  return interaction.editReply({
    embeds: [infoEmbed(`Blacklist (${entries.length})`, lines.join("\n")).setFooter({ text: "Showing up to 30 entries" })],
  });
}

async function handleCheck(interaction) {
  const value = interaction.options.getString("value").trim();
  const entry = await Blacklist.findOne({ value });

  if (!entry) {
    return interaction.editReply({ embeds: [successEmbed("Not Blacklisted", `\`${value}\` is **not** in the blacklist.`)] });
  }

  return interaction.editReply({
    embeds: [
      errorEmbed("Blacklisted", `\`${value}\` **is** in the blacklist.`)
        .addFields(
          { name: "Type",   value: entry.type,   inline: true },
          { name: "Reason", value: entry.reason, inline: true },
          { name: "Added",  value: entry.createdAt, inline: true },
        ),
    ],
  });
}

module.exports = { data, execute };

/**
 * /createticket  — Create and manage ticket categories, then send the panel
 * /deleteticket  — Delete a ticket category
 * /ticketpanel   — Send the ticket panel to a channel
 *
 * This mirrors the FireDesign bot style where:
 *  /createticket name:Support categoryid:... teampingid:@Support emoji:🎫
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const { TicketCategory } = require("../../models");
const { getGuildConfig } = require("../../utils/guildConfig");
const { successEmbed, errorEmbed, infoEmbed, brandEmbed, hex } = require("../../utils/embeds");

// ── /createticket ─────────────────────────────────────────────────────────────
const createData = new SlashCommandBuilder()
  .setName("createticket")
  .setDescription("Create a new ticket category (Admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o =>
    o.setName("name").setDescription("Category name (e.g. Licensing Support)").setRequired(true)
  )
  .addStringOption(o =>
    o.setName("emoji").setDescription("Emoji for this category (e.g. 🔑)").setRequired(true)
  )
  .addStringOption(o =>
    o.setName("description").setDescription("Short description shown in the dropdown").setRequired(true)
  )
  .addRoleOption(o =>
    o.setName("teampingid").setDescription("Role to ping when this ticket is opened (@Support, @everyone, etc.)")
  )
  .addStringOption(o =>
    o.setName("prefix").setDescription("Channel name prefix (e.g. 'license' → license-username). Defaults to slugified name.")
  );

async function executeCreate(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId     = interaction.guild.id;
  const name        = interaction.options.getString("name");
  const emoji       = interaction.options.getString("emoji");
  const description = interaction.options.getString("description");
  const teamRole    = interaction.options.getRole("teampingid");
  const prefixRaw   = interaction.options.getString("prefix");
  const prefix      = (prefixRaw || name).toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").slice(0, 20);

  const guildCfg = await getGuildConfig(guildId);

  // Check for duplicate name
  const existing = await TicketCategory.findOne({ guildId, name: new RegExp(`^${name}$`, "i") });
  if (existing) {
    return interaction.editReply({
      embeds: [errorEmbed("Already Exists", `A ticket category named **${name}** already exists.\nUse \`/deleteticket\` to remove it first.`)],
    });
  }

  const cat = await TicketCategory.create({
    guildId,
    categoryId: uuidv4(),
    name,
    description,
    emoji,
    prefix,
    teamPingId: teamRole?.id || null,
  });

  const totalCats = await TicketCategory.countDocuments({ guildId });

  const embed = successEmbed("Ticket Category Created", `**${emoji} ${name}** has been added to the ticket panel.`)
    .addFields(
      { name: "📝 Description",  value: description,                              inline: false },
      { name: "🔖 Prefix",       value: `\`${prefix}-username\``,                 inline: true  },
      { name: "📣 Team Ping",    value: teamRole ? `${teamRole}` : "*None*",      inline: true  },
      { name: "📊 Total Categories", value: `${totalCats}`,                       inline: true  },
    )
    .setFooter({ text: "Use /ticketpanel to send the updated panel" });

  return interaction.editReply({ embeds: [embed] });
}

// ── /deleteticket ─────────────────────────────────────────────────────────────
const deleteData = new SlashCommandBuilder()
  .setName("deleteticket")
  .setDescription("Delete a ticket category (Admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addStringOption(o =>
    o.setName("name").setDescription("Name of the category to delete").setRequired(true).setAutocomplete(true)
  );

async function executeDelete(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const name = interaction.options.getString("name");
  const deleted = await TicketCategory.findOneAndDelete({
    guildId: interaction.guild.id,
    name: new RegExp(`^${name}$`, "i"),
  });

  if (!deleted) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `No ticket category named **${name}** found.`)] });
  }

  return interaction.editReply({
    embeds: [successEmbed("Category Deleted", `**${deleted.emoji} ${deleted.name}** has been removed from the ticket panel.\nUse \`/ticketpanel\` to update the panel.`)],
  });
}

// ── /listtickets ──────────────────────────────────────────────────────────────
const listData = new SlashCommandBuilder()
  .setName("listtickets")
  .setDescription("List all ticket categories for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function executeList(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const cats = await TicketCategory.find({ guildId: interaction.guild.id }).sort({ createdAt: 1 });

  if (!cats.length) {
    return interaction.editReply({
      embeds: [infoEmbed("No Categories", "No ticket categories yet.\nUse `/createticket` to add one.")],
    });
  }

  const lines = cats.map((c, i) =>
    `**${i + 1}.** ${c.emoji} **${c.name}**\n> ${c.description}\n> Prefix: \`${c.prefix}\` · Ping: ${c.teamPingId ? `<@&${c.teamPingId}>` : "*None*"}`
  ).join("\n\n");

  return interaction.editReply({
    embeds: [infoEmbed(`Ticket Categories (${cats.length})`, lines)],
  });
}

// ── /ticketpanel ──────────────────────────────────────────────────────────────
const panelData = new SlashCommandBuilder()
  .setName("ticketpanel")
  .setDescription("Send the ticket panel to a channel")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addChannelOption(o =>
    o.setName("channel").setDescription("Channel to send the panel to (defaults to current channel)")
      .addChannelTypes(ChannelType.GuildText)
  );

async function executePanel(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId  = interaction.guild.id;
  const target   = interaction.options.getChannel("channel") || interaction.channel;
  const guildCfg = await getGuildConfig(guildId);
  const cats     = await TicketCategory.find({ guildId }).sort({ createdAt: 1 });

  const brandName = guildCfg.brandName || "Nexora";
  const color     = hex(guildCfg.brandColor || "5865F2");

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${brandName} • SUPPORT TICKET SYSTEM`)
    .setDescription(
      `Hast du ein Problem oder eine Frage? Erstelle einfach ein Support-Ticket!\n\n` +
      `**Wie funktioniert es?**\n` +
      `• Wähle eine Kategorie aus dem Dropdown unten\n` +
      `• Gib dein Name und deinen Grund an\n` +
      `• Unser Support-Team wird sich schnellstmöglich um dich kümmern!\n\n` +
      `**Verfügbare Kategorien:** ${cats.length}`
    )
    .setFooter({ text: guildCfg.brandFooter || "Nexora Support", iconURL: guildCfg.brandIcon || undefined })
    .setTimestamp();

  if (guildCfg.brandIcon) embed.setThumbnail(guildCfg.brandIcon);

  // Build dropdown
  let components = [];
  if (cats.length > 0) {
    const options = cats.map(c => ({
      label: c.name,
      description: c.description.slice(0, 100),
      value: `nexora_open_${c.categoryId}`,
      emoji: c.emoji,
    }));

    const row = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId("nexora_ticket_category")
        .setPlaceholder("🎫  Wähle eine Ticket-Kategorie...")
        .addOptions(options)
    );
    components = [row];
  } else {
    embed.setDescription(embed.data.description + "\n\n> ⚠️ No ticket categories configured yet. Use `/createticket` to add some.");
  }

  await target.send({ embeds: [embed], components });

  return interaction.editReply({
    embeds: [successEmbed("Panel Sent", `Ticket panel has been sent to ${target}.\n\nTip: **${cats.length}** categor${cats.length === 1 ? "y" : "ies"} shown.`)],
  });
}

// ── Autocomplete handler (for /deleteticket name) ─────────────────────────────
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const cats = await TicketCategory.find({ guildId: interaction.guild.id }).limit(25);
  const filtered = cats
    .filter(c => c.name.toLowerCase().includes(focused))
    .map(c => ({ name: `${c.emoji} ${c.name}`, value: c.name }));
  await interaction.respond(filtered);
}

module.exports = {
  // createticket
  data:    createData,
  execute: executeCreate,

  // Extra commands exported separately
  deleteTicket: { data: deleteData,  execute: executeDelete, autocomplete },
  listTickets:  { data: listData,    execute: executeList },
  ticketPanel:  { data: panelData,   execute: executePanel },
};

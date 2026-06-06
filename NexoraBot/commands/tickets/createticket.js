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
  await interaction.deferReply({ flags: 64 });

  const guildId  = interaction.guild.id;
  const target   = interaction.options.getChannel("channel") || interaction.channel;
  const guildCfg = await getGuildConfig(guildId);
  const cats     = await TicketCategory.find({ guildId }).sort({ createdAt: 1 });
  const {
    ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
    MediaGalleryBuilder, MediaGalleryItemBuilder, UnfurledMediaItemBuilder,
    ActionRowBuilder: AR, StringSelectMenuBuilder: SSM, MessageFlags: MF2,
  } = require("discord.js");

  const panelTitle  = guildCfg.ticketPanelTitle  || "Nexora - Tickets";
  const beforeText  = guildCfg.ticketPanelBefore || "Think about your request in advance and describe it clearly and concisely. The more precise your information, the faster and more efficiently we can help you.";
  const whyUsText   = guildCfg.ticketPanelWhyUs  || "Fast, reliable support without detours. Clear processes, high quality and a team that delivers instead of just promising.";

  const container = new ContainerBuilder();

  // Banner
  if (guildCfg.welcomeBannerUrl) {
    container.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder()
          .setMedia(new UnfurledMediaItemBuilder().setURL(guildCfg.welcomeBannerUrl))
      )
    );
  }

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`## 🎫 ${panelTitle}`)
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // Before opening
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `- **Before Opening a Ticket** 🎟️
> ${beforeText}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // Why us
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(
      `- **Why Us?** 🌐
> ${whyUsText}`
    )
  );

  container.addSeparatorComponents(new SeparatorBuilder());

  // Categories list
  const catLines = cats.length > 0
    ? cats.map(cat => `  - ${cat.emoji} ${cat.name}`).join("\n")
    : "  - *(No categories yet — use /createticket)*";

  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`- **Categories** 🗒️\n${catLines}`)
  );

  const msgComponents = [container];

  if (cats.length > 0) {
    const row = new AR().addComponents(
      new SSM()
        .setCustomId("nexora_ticket_category")
        .setPlaceholder("Wähle eine Kategorie um dein Ticket zu erstellen...")
        .addOptions(cats.map(cat => ({
          label: cat.name,
          description: cat.description.slice(0, 100),
          value: `nexora_open_${cat.categoryId}`,
          emoji: cat.emoji,
        })))
    );
    msgComponents.push(row);
  }

  await target.send({ components: msgComponents, flags: MF2.IsComponentsV2 });
  return interaction.editReply({ content: `✅ Ticket panel sent to ${target}. (${cats.length} categories)` });
}


async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const { TicketCategory } = require("../../models");
  const cats = await TicketCategory.find({ guildId: interaction.guild.id }).limit(25);
  await interaction.respond(
    cats.filter(c => c.name.toLowerCase().includes(focused))
       .map(c => ({ name: `${c.emoji} ${c.name}`, value: c.name }))
  );
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

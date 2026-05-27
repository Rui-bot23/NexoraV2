/**
 * /setup — Configure Nexora entirely from Discord
 *
 * Subcommands:
 *   tickets   — set log channel, support category, support roles, options
 *   reviews   — set review channel, log channel, admin roles, options
 *   branding  — set bot name, color, footer text, icon url
 *   view      — show current config for this server
 *   reset     — reset a section to defaults
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
} = require("discord.js");
const { getGuildConfig, updateGuildConfig } = require("../../utils/guildConfig");
const { successEmbed, errorEmbed, infoEmbed, brandEmbed, hex } = require("../../utils/embeds");

const data = new SlashCommandBuilder()
  .setName("setup")
  .setDescription("Configure Nexora for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  // ── Tickets ────────────────────────────────────────────────────────────────
  .addSubcommandGroup(group =>
    group.setName("tickets").setDescription("Configure the ticket system")
      .addSubcommand(sub =>
        sub.setName("logs")
          .setDescription("Set the channel where ticket transcripts are posted")
          .addChannelOption(o =>
            o.setName("channel").setDescription("Transcript log channel").setRequired(true)
              .addChannelTypes(ChannelType.GuildText)
          )
      )
      .addSubcommand(sub =>
        sub.setName("category")
          .setDescription("Set the Discord category where ticket channels are created")
          .addChannelOption(o =>
            o.setName("category").setDescription("Discord channel category").setRequired(true)
              .addChannelTypes(ChannelType.GuildCategory)
          )
      )
      .addSubcommand(sub =>
        sub.setName("addrole")
          .setDescription("Add a support role (staff who can see & manage tickets)")
          .addRoleOption(o => o.setName("role").setDescription("Support role").setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName("removerole")
          .setDescription("Remove a support role")
          .addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName("options")
          .setDescription("Set ticket system options")
          .addIntegerOption(o => o.setName("max_per_user").setDescription("Max open tickets per user (default 1)").setMinValue(1).setMaxValue(5))
          .addBooleanOption(o => o.setName("dm_transcript").setDescription("DM transcript to user on close (default true)"))
          .addIntegerOption(o => o.setName("close_delay").setDescription("Seconds before channel deletes after close (default 5)").setMinValue(0).setMaxValue(60))
          .addBooleanOption(o => o.setName("ratings").setDescription("Ask for rating when ticket closes (default true)"))
      )
  )

  // ── Reviews ────────────────────────────────────────────────────────────────
  .addSubcommandGroup(group =>
    group.setName("reviews").setDescription("Configure the review system")
      .addSubcommand(sub =>
        sub.setName("channel")
          .setDescription("Set the channel where reviews are posted")
          .addChannelOption(o =>
            o.setName("channel").setDescription("Review channel").setRequired(true)
              .addChannelTypes(ChannelType.GuildText)
          )
      )
      .addSubcommand(sub =>
        sub.setName("logs")
          .setDescription("Set the channel for review admin logs")
          .addChannelOption(o =>
            o.setName("channel").setDescription("Review log channel").setRequired(true)
              .addChannelTypes(ChannelType.GuildText)
          )
      )
      .addSubcommand(sub =>
        sub.setName("adminrole")
          .setDescription("Add or remove a review admin role")
          .addStringOption(o =>
            o.setName("action").setDescription("Add or remove").setRequired(true)
              .addChoices({ name: "Add", value: "add" }, { name: "Remove", value: "remove" })
          )
          .addRoleOption(o => o.setName("role").setDescription("Role").setRequired(true))
      )
      .addSubcommand(sub =>
        sub.setName("options")
          .setDescription("Set review system options")
          .addBooleanOption(o => o.setName("allow_images").setDescription("Allow image attachments in reviews"))
          .addIntegerOption(o => o.setName("max_length").setDescription("Max review character length").setMinValue(50).setMaxValue(2000))
          .addIntegerOption(o => o.setName("cooldown").setDescription("Seconds between reviews per user").setMinValue(0).setMaxValue(86400))
      )
  )

  // ── Branding ───────────────────────────────────────────────────────────────
  .addSubcommandGroup(group =>
    group.setName("branding").setDescription("Customise bot branding for this server")
      .addSubcommand(sub =>
        sub.setName("set")
          .setDescription("Set branding options")
          .addStringOption(o => o.setName("name").setDescription("Bot/brand display name (e.g. Nexora)"))
          .addStringOption(o => o.setName("color").setDescription("Embed color as hex (e.g. 5865F2)"))
          .addStringOption(o => o.setName("footer").setDescription("Embed footer text"))
          .addStringOption(o => o.setName("icon_url").setDescription("Icon URL for embed footer"))
      )
  )

  // ── View ───────────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName("view")
      .setDescription("View the current Nexora configuration for this server")
  )

  // ── Reset ──────────────────────────────────────────────────────────────────
  .addSubcommand(sub =>
    sub.setName("reset")
      .setDescription("Reset a config section to defaults")
      .addStringOption(o =>
        o.setName("section").setDescription("Which section to reset").setRequired(true)
          .addChoices(
            { name: "Tickets", value: "tickets" },
            { name: "Reviews", value: "reviews" },
            { name: "Branding", value: "branding" },
            { name: "Everything", value: "all" },
          )
      )
  );

// ── Execute ───────────────────────────────────────────────────────────────────
async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guild.id;
  const guildCfg = await getGuildConfig(guildId);

  // Top-level subcommands
  const sub = interaction.options.getSubcommand(false);
  const group = interaction.options.getSubcommandGroup(false);

  try {
    if (sub === "view")  return await handleView(interaction, guildCfg);
    if (sub === "reset") return await handleReset(interaction, guildId, guildCfg);

    if (group === "tickets") {
      if (sub === "logs")       return await ticketLogs(interaction, guildId, guildCfg);
      if (sub === "category")   return await ticketCategory(interaction, guildId, guildCfg);
      if (sub === "addrole")    return await ticketRole(interaction, guildId, guildCfg, true);
      if (sub === "removerole") return await ticketRole(interaction, guildId, guildCfg, false);
      if (sub === "options")    return await ticketOptions(interaction, guildId, guildCfg);
    }

    if (group === "reviews") {
      if (sub === "channel")   return await reviewChannel(interaction, guildId, guildCfg);
      if (sub === "logs")      return await reviewLogs(interaction, guildId, guildCfg);
      if (sub === "adminrole") return await reviewAdminRole(interaction, guildId, guildCfg);
      if (sub === "options")   return await reviewOptions(interaction, guildId, guildCfg);
    }

    if (group === "branding") {
      if (sub === "set") return await brandingSet(interaction, guildId, guildCfg);
    }
  } catch (err) {
    console.error("[SETUP CMD]", err);
    return interaction.editReply({ embeds: [errorEmbed("Error", err.message)] });
  }
}

// ── View ──────────────────────────────────────────────────────────────────────
async function handleView(interaction, cfg) {
  const { TicketCategory } = require("../../models");
  const ticketCats = await TicketCategory.find({ guildId: interaction.guild.id });

  const supportRoles = cfg.ticketSupportRoleIds?.length
    ? cfg.ticketSupportRoleIds.map(id => `<@&${id}>`).join(", ")
    : "*None set*";

  const reviewAdmins = cfg.reviewAdminRoleIds?.length
    ? cfg.reviewAdminRoleIds.map(id => `<@&${id}>`).join(", ")
    : "*None set*";

  const embed = new EmbedBuilder()
    .setColor(hex(cfg.brandColor || "5865F2"))
    .setTitle(`⚙️  Nexora Config — ${interaction.guild.name}`)
    .addFields(
      {
        name: "🎨 Branding",
        value: [
          `**Name:** ${cfg.brandName || "Nexora"}`,
          `**Color:** \`#${cfg.brandColor || "5865F2"}\``,
          `**Footer:** ${cfg.brandFooter || "Nexora"}`,
          `**Icon:** ${cfg.brandIcon ? `[link](${cfg.brandIcon})` : "*Not set*"}`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🎫 Tickets",
        value: [
          `**Log Channel:** ${cfg.ticketLogChannelId ? `<#${cfg.ticketLogChannelId}>` : "❌ *Not set*"}`,
          `**Category:** ${cfg.ticketCategoryId ? `<#${cfg.ticketCategoryId}>` : "❌ *Not set*"}`,
          `**Support Roles:** ${supportRoles}`,
          `**Max per User:** ${cfg.ticketMaxPerUser ?? 1}`,
          `**DM Transcript:** ${cfg.ticketDmTranscript ? "✅" : "❌"}`,
          `**Close Delay:** ${cfg.ticketCloseDelay ?? 5}s`,
          `**Ratings:** ${cfg.ticketRatingsEnabled ? "✅" : "❌"}`,
          `**Categories:** ${ticketCats.length} (use \`/createticket\`)`,
        ].join("\n"),
        inline: false,
      },
      {
        name: "⭐ Reviews",
        value: [
          `**Review Channel:** ${cfg.reviewChannelId ? `<#${cfg.reviewChannelId}>` : "❌ *Not set*"}`,
          `**Log Channel:** ${cfg.reviewLogChannelId ? `<#${cfg.reviewLogChannelId}>` : "*Not set*"}`,
          `**Admin Roles:** ${reviewAdmins}`,
          `**Allow Images:** ${cfg.reviewAllowImages ? "✅" : "❌"}`,
          `**Max Length:** ${cfg.reviewMaxLength ?? 500} chars`,
          `**Cooldown:** ${cfg.reviewCooldown ?? 60}s`,
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({ text: `Guild ID: ${interaction.guild.id}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

// ── Reset ─────────────────────────────────────────────────────────────────────
async function handleReset(interaction, guildId, cfg) {
  const section = interaction.options.getString("section");
  const updates = {};

  if (section === "tickets" || section === "all") {
    Object.assign(updates, {
      ticketLogChannelId: null, ticketCategoryId: null,
      ticketSupportRoleIds: [], ticketMaxPerUser: 1,
      ticketDmTranscript: true, ticketCloseDelay: 5, ticketRatingsEnabled: true,
    });
  }
  if (section === "reviews" || section === "all") {
    Object.assign(updates, {
      reviewChannelId: null, reviewLogChannelId: null,
      reviewAdminRoleIds: [], reviewAllowImages: true,
      reviewMaxLength: 500, reviewCooldown: 60,
    });
  }
  if (section === "branding" || section === "all") {
    Object.assign(updates, {
      brandName: "Nexora", brandColor: "5865F2",
      brandFooter: "Nexora Support", brandIcon: null,
    });
  }

  await updateGuildConfig(guildId, updates);
  return interaction.editReply({
    embeds: [successEmbed("Config Reset", `The **${section}** section has been reset to defaults.`)],
  });
}

// ── Ticket Handlers ───────────────────────────────────────────────────────────
async function ticketLogs(interaction, guildId, cfg) {
  const channel = interaction.options.getChannel("channel");
  await updateGuildConfig(guildId, { ticketLogChannelId: channel.id });
  return interaction.editReply({
    embeds: [successEmbed("Ticket Logs Set", `Ticket transcripts will now be posted in ${channel}.`)],
  });
}

async function ticketCategory(interaction, guildId, cfg) {
  const category = interaction.options.getChannel("category");
  await updateGuildConfig(guildId, { ticketCategoryId: category.id });
  return interaction.editReply({
    embeds: [successEmbed("Ticket Category Set", `New ticket channels will be created under **${category.name}**.`)],
  });
}

async function ticketRole(interaction, guildId, cfg, add) {
  const role = interaction.options.getRole("role");
  let roles = [...(cfg.ticketSupportRoleIds || [])];

  if (add) {
    if (roles.includes(role.id)) {
      return interaction.editReply({ embeds: [errorEmbed("Already Added", `${role} is already a support role.`)] });
    }
    roles.push(role.id);
  } else {
    if (!roles.includes(role.id)) {
      return interaction.editReply({ embeds: [errorEmbed("Not Found", `${role} is not in the support roles list.`)] });
    }
    roles = roles.filter(id => id !== role.id);
  }

  await updateGuildConfig(guildId, { ticketSupportRoleIds: roles });
  return interaction.editReply({
    embeds: [successEmbed(
      add ? "Support Role Added" : "Support Role Removed",
      add ? `${role} can now see and manage tickets.` : `${role} has been removed from support roles.`
    )],
  });
}

async function ticketOptions(interaction, guildId, cfg) {
  const updates = {};
  const maxPerUser    = interaction.options.getInteger("max_per_user");
  const dmTranscript  = interaction.options.getBoolean("dm_transcript");
  const closeDelay    = interaction.options.getInteger("close_delay");
  const ratings       = interaction.options.getBoolean("ratings");

  if (maxPerUser   !== null) updates.ticketMaxPerUser    = maxPerUser;
  if (dmTranscript !== null) updates.ticketDmTranscript  = dmTranscript;
  if (closeDelay   !== null) updates.ticketCloseDelay    = closeDelay;
  if (ratings      !== null) updates.ticketRatingsEnabled = ratings;

  if (!Object.keys(updates).length) {
    return interaction.editReply({ embeds: [errorEmbed("Nothing Changed", "Provide at least one option to update.")] });
  }

  await updateGuildConfig(guildId, updates);

  const lines = [];
  if (maxPerUser   !== null) lines.push(`**Max per user:** ${maxPerUser}`);
  if (dmTranscript !== null) lines.push(`**DM Transcript:** ${dmTranscript ? "✅ Enabled" : "❌ Disabled"}`);
  if (closeDelay   !== null) lines.push(`**Close Delay:** ${closeDelay}s`);
  if (ratings      !== null) lines.push(`**Ratings:** ${ratings ? "✅ Enabled" : "❌ Disabled"}`);

  return interaction.editReply({
    embeds: [successEmbed("Ticket Options Updated", lines.join("\n"))],
  });
}

// ── Review Handlers ───────────────────────────────────────────────────────────
async function reviewChannel(interaction, guildId, cfg) {
  const channel = interaction.options.getChannel("channel");
  await updateGuildConfig(guildId, { reviewChannelId: channel.id });
  return interaction.editReply({
    embeds: [successEmbed("Review Channel Set", `Reviews will now be posted in ${channel}.`)],
  });
}

async function reviewLogs(interaction, guildId, cfg) {
  const channel = interaction.options.getChannel("channel");
  await updateGuildConfig(guildId, { reviewLogChannelId: channel.id });
  return interaction.editReply({
    embeds: [successEmbed("Review Log Channel Set", `Review admin actions will be logged in ${channel}.`)],
  });
}

async function reviewAdminRole(interaction, guildId, cfg) {
  const action = interaction.options.getString("action");
  const role   = interaction.options.getRole("role");
  let roles = [...(cfg.reviewAdminRoleIds || [])];

  if (action === "add") {
    if (roles.includes(role.id)) return interaction.editReply({ embeds: [errorEmbed("Already Added", `${role} is already a review admin role.`)] });
    roles.push(role.id);
  } else {
    if (!roles.includes(role.id)) return interaction.editReply({ embeds: [errorEmbed("Not Found", `${role} is not a review admin role.`)] });
    roles = roles.filter(id => id !== role.id);
  }

  await updateGuildConfig(guildId, { reviewAdminRoleIds: roles });
  return interaction.editReply({
    embeds: [successEmbed(
      action === "add" ? "Review Admin Role Added" : "Review Admin Role Removed",
      `${role} has been ${action === "add" ? "added to" : "removed from"} review admin roles.`
    )],
  });
}

async function reviewOptions(interaction, guildId, cfg) {
  const updates = {};
  const allowImages = interaction.options.getBoolean("allow_images");
  const maxLength   = interaction.options.getInteger("max_length");
  const cooldown    = interaction.options.getInteger("cooldown");

  if (allowImages !== null) updates.reviewAllowImages = allowImages;
  if (maxLength   !== null) updates.reviewMaxLength   = maxLength;
  if (cooldown    !== null) updates.reviewCooldown    = cooldown;

  if (!Object.keys(updates).length) {
    return interaction.editReply({ embeds: [errorEmbed("Nothing Changed", "Provide at least one option to update.")] });
  }

  await updateGuildConfig(guildId, updates);

  const lines = [];
  if (allowImages !== null) lines.push(`**Allow Images:** ${allowImages ? "✅ Enabled" : "❌ Disabled"}`);
  if (maxLength   !== null) lines.push(`**Max Length:** ${maxLength} chars`);
  if (cooldown    !== null) lines.push(`**Cooldown:** ${cooldown}s`);

  return interaction.editReply({
    embeds: [successEmbed("Review Options Updated", lines.join("\n"))],
  });
}

// ── Branding ──────────────────────────────────────────────────────────────────
async function brandingSet(interaction, guildId, cfg) {
  const updates = {};
  const name    = interaction.options.getString("name");
  const color   = interaction.options.getString("color");
  const footer  = interaction.options.getString("footer");
  const iconUrl = interaction.options.getString("icon_url");

  if (name)    updates.brandName   = name;
  if (footer)  updates.brandFooter = footer;
  if (iconUrl) updates.brandIcon   = iconUrl;

  if (color) {
    const clean = color.replace("#", "");
    if (!/^[0-9a-fA-F]{6}$/.test(clean)) {
      return interaction.editReply({ embeds: [errorEmbed("Invalid Color", "Color must be a valid 6-digit hex code like `5865F2` or `#FF0000`.")] });
    }
    updates.brandColor = clean;
  }

  if (!Object.keys(updates).length) {
    return interaction.editReply({ embeds: [errorEmbed("Nothing Changed", "Provide at least one branding option to update.")] });
  }

  await updateGuildConfig(guildId, updates);

  const lines = [];
  if (name)    lines.push(`**Name:** ${name}`);
  if (color)   lines.push(`**Color:** \`#${color.replace("#","")}\``);
  if (footer)  lines.push(`**Footer:** ${footer}`);
  if (iconUrl) lines.push(`**Icon:** [link](${iconUrl})`);

  return interaction.editReply({
    embeds: [successEmbed("Branding Updated", lines.join("\n"))],
  });
}

module.exports = { data, execute };

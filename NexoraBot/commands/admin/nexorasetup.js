/**
 * /nexorasetup — Configure Nexora bot from Discord
 * Subcommands: welcome, tickets, pricing, redeem, view
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");

// Helper: quick CV2 response
function cv2(color, ...blocks) {
  const c = new ContainerBuilder().setAccentColor(color);
  for (let i = 0; i < blocks.length; i++) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(blocks[i]));
    if (i < blocks.length - 1) c.addSeparatorComponents(new SeparatorBuilder());
  }
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}
const { getGuildConfig, updateGuildConfig } = require("../../utils/guildConfig");

const data = new SlashCommandBuilder()
  .setName("nexorasetup")
  .setDescription("Configure Nexora for this server")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  // ── Welcome ────────────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g.setName("welcome").setDescription("Configure welcome messages")
    .addSubcommand(s => s.setName("channel")
      .setDescription("Set the welcome channel")
      .addChannelOption(o => o.setName("channel").setDescription("Welcome channel").setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(s => s.setName("banner")
      .setDescription("Set the banner image URL")
      .addStringOption(o => o.setName("url").setDescription("Image URL").setRequired(true))
    )
    .addSubcommand(s => s.setName("text")
      .setDescription("Customize welcome text")
      .addStringOption(o => o.setName("title").setDescription("Title (e.g. Welcome to Nexora)"))
      .addStringOption(o => o.setName("description").setDescription("Description. Use {user}, {username}, {server}"))
    )
    .addSubcommand(s => s.setName("buttons")
      .setDescription("Set verify and ticket buttons")
      .addStringOption(o => o.setName("verify_url").setDescription("Verify button URL"))
      .addStringOption(o => o.setName("verify_label").setDescription("Verify button label (default: Verify)"))
      .addStringOption(o => o.setName("ticket_url").setDescription("Ticket button URL"))
      .addStringOption(o => o.setName("ticket_label").setDescription("Ticket button label (default: Ticket System)"))
    )
    .addSubcommand(s => s.setName("test").setDescription("Send a test welcome for yourself"))
  )

  // ── Tickets ────────────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g.setName("tickets").setDescription("Configure ticket system")
    .addSubcommand(s => s.setName("logs")
      .setDescription("Set transcript log channel")
      .addChannelOption(o => o.setName("channel").setDescription("Log channel").setRequired(true).addChannelTypes(ChannelType.GuildText))
    )
    .addSubcommand(s => s.setName("category")
      .setDescription("Set Discord category for ticket channels")
      .addChannelOption(o => o.setName("category").setDescription("Discord category").setRequired(true).addChannelTypes(ChannelType.GuildCategory))
    )
    .addSubcommand(s => s.setName("addrole")
      .setDescription("Add a support role")
      .addRoleOption(o => o.setName("role").setDescription("Support role").setRequired(true))
    )
    .addSubcommand(s => s.setName("removerole")
      .setDescription("Remove a support role")
      .addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true))
    )
    .addSubcommand(s => s.setName("options")
      .setDescription("Set ticket options")
      .addIntegerOption(o => o.setName("max_per_user").setDescription("Max open tickets per user").setMinValue(1).setMaxValue(5))
      .addBooleanOption(o => o.setName("dm_transcript").setDescription("DM transcript on close"))
      .addIntegerOption(o => o.setName("close_delay").setDescription("Seconds before channel deletes").setMinValue(0).setMaxValue(60))
    )
    .addSubcommand(s => s.setName("panel_text")
      .setDescription("Customize ticket panel text")
      .addStringOption(o => o.setName("title").setDescription("Panel title"))
      .addStringOption(o => o.setName("before_text").setDescription("Before Opening a Ticket text"))
      .addStringOption(o => o.setName("why_us").setDescription("Why Us text"))
    )
  )

  // ── Redeem test mode ────────────────────────────────────────────────────────
  .addSubcommandGroup(g => g.setName("redeem").setDescription("Manage redeem test mode")
    .addSubcommand(s => s.setName("testmode")
      .setDescription("Enable/disable redeem test mode (bypass license validation)")
      .addBooleanOption(o => o.setName("enabled").setDescription("Enable test mode").setRequired(true))
    )
    .addSubcommand(s => s.setName("enable")
      .setDescription("Enable redeem on a specific license key")
      .addStringOption(o => o.setName("key").setDescription("License key").setRequired(true))
    )
    .addSubcommand(s => s.setName("disable")
      .setDescription("Disable redeem on a specific license key")
      .addStringOption(o => o.setName("key").setDescription("License key").setRequired(true))
    )
    .addSubcommand(s => s.setName("reset")
      .setDescription("Reset redeem status on a license (un-redeem it)")
      .addStringOption(o => o.setName("key").setDescription("License key").setRequired(true))
    )
  )

  // ── View ───────────────────────────────────────────────────────────────────
  .addSubcommand(s => s.setName("view").setDescription("View current configuration"));

async function execute(interaction) {
  await interaction.deferReply({ flags: 64 });
  const guildId = interaction.guild.id;
  const cfg     = await getGuildConfig(guildId);
  const sub     = interaction.options.getSubcommand(false);
  const group   = interaction.options.getSubcommandGroup(false);

  try {
    if (sub === "view") return await handleView(interaction, cfg);
    if (group === "welcome") return await handleWelcome(interaction, guildId, cfg, sub);
    if (group === "tickets") return await handleTickets(interaction, guildId, cfg, sub);
    if (group === "redeem")  return await handleRedeem(interaction, guildId, cfg, sub);
  } catch (err) {
    console.error("[NEXORASETUP]", err);
    return interaction.editReply({ content: `❌ Error: ${err.message}` });
  }
}

// ── View ──────────────────────────────────────────────────────────────────────
async function handleView(interaction, cfg) {
  const ch = id => id ? `<#${id}>` : "❌ Not set";
  const r  = ids => ids?.length ? ids.map(id => `<@&${id}>`).join(", ") : "❌ None";

  return interaction.editReply(
    cv2(0x9B59B6,
      "# ⚙️ Nexora Configuration",
      [
        "**👋 Welcome**",
        `> Channel: ${ch(cfg.welcomeChannelId)}`,
        `> Banner: ${cfg.welcomeBannerUrl ? `[Link](${cfg.welcomeBannerUrl})` : "❌ Not set"}`,
        `> Title: ${cfg.welcomeTitle || "Welcome to Nexora"}`,
      ].join("\n"),
      [
        "**🎫 Tickets**",
        `> Log Channel: ${ch(cfg.ticketLogChannelId)}`,
        `> Category: ${ch(cfg.ticketCategoryId)}`,
        `> Support Roles: ${r(cfg.ticketSupportRoleIds)}`,
        `> Max per user: ${cfg.ticketMaxPerUser ?? 1} · DM Transcript: ${cfg.ticketDmTranscript !== false ? "✅" : "❌"}`,
      ].join("\n"),
      [
        "**🔑 Redeem Test Mode**",
        cfg.redeemTestMode
          ? "> ⚠️ **ENABLED** — License validation is bypassed"
          : "> ❌ Disabled",
      ].join("\n"),
      `-# Nexora • ${interaction.guild.name}`
    )
  );
}

// ── Welcome ───────────────────────────────────────────────────────────────────
async function handleWelcome(interaction, guildId, cfg, sub) {
  if (sub === "channel") {
    const ch = interaction.options.getChannel("channel");
    await updateGuildConfig(guildId, { welcomeChannelId: ch.id });
    return interaction.editReply({ content: `✅ Welcome channel set to ${ch}` });
  }

  if (sub === "banner") {
    const url = interaction.options.getString("url");
    await updateGuildConfig(guildId, { welcomeBannerUrl: url });
    return interaction.editReply({ content: `✅ Banner set.` });
  }

  if (sub === "text") {
    const title = interaction.options.getString("title");
    const desc  = interaction.options.getString("description");
    const updates = {};
    if (title) updates.welcomeTitle = title;
    if (desc)  updates.welcomeDescription = desc;
    if (!Object.keys(updates).length) return interaction.editReply({ content: "⚠️ Provide at least one option." });
    await updateGuildConfig(guildId, updates);
    return interaction.editReply({ content: `✅ Welcome text updated.\n**Placeholders:** \`{user}\` \`{username}\` \`{server}\`` });
  }

  if (sub === "buttons") {
    const vUrl   = interaction.options.getString("verify_url");
    const vLabel = interaction.options.getString("verify_label");
    const tUrl   = interaction.options.getString("ticket_url");
    const tLabel = interaction.options.getString("ticket_label");
    const updates = {};
    if (vUrl)   updates.welcomeVerifyUrl   = vUrl;
    if (vLabel) updates.welcomeVerifyLabel = vLabel;
    if (tUrl)   updates.welcomeTicketUrl   = tUrl;
    if (tLabel) updates.welcomeTicketLabel = tLabel;
    await updateGuildConfig(guildId, updates);
    return interaction.editReply({ content: "✅ Welcome buttons updated." });
  }

  if (sub === "test") {
    // Fire the welcome event manually for the interaction member
    const { execute: welcomeExec } = require("../../events/guildMemberAdd");
    await welcomeExec(interaction.member, interaction.client);
    return interaction.editReply({ content: `✅ Test welcome sent to <#${cfg.welcomeChannelId}>` });
  }
}

// ── Tickets ───────────────────────────────────────────────────────────────────
async function handleTickets(interaction, guildId, cfg, sub) {
  if (sub === "logs") {
    const ch = interaction.options.getChannel("channel");
    await updateGuildConfig(guildId, { ticketLogChannelId: ch.id });
    return interaction.editReply({ content: `✅ Ticket log channel: ${ch}` });
  }
  if (sub === "category") {
    const cat = interaction.options.getChannel("category");
    await updateGuildConfig(guildId, { ticketCategoryId: cat.id });
    return interaction.editReply({ content: `✅ Ticket category: **${cat.name}**` });
  }
  if (sub === "addrole") {
    const role  = interaction.options.getRole("role");
    const roles = [...(cfg.ticketSupportRoleIds || [])];
    if (!roles.includes(role.id)) roles.push(role.id);
    await updateGuildConfig(guildId, { ticketSupportRoleIds: roles });
    return interaction.editReply({ content: `✅ Added support role: ${role}` });
  }
  if (sub === "removerole") {
    const role  = interaction.options.getRole("role");
    const roles = (cfg.ticketSupportRoleIds || []).filter(id => id !== role.id);
    await updateGuildConfig(guildId, { ticketSupportRoleIds: roles });
    return interaction.editReply({ content: `✅ Removed support role: ${role}` });
  }
  if (sub === "options") {
    const updates = {};
    const max   = interaction.options.getInteger("max_per_user");
    const dm    = interaction.options.getBoolean("dm_transcript");
    const delay = interaction.options.getInteger("close_delay");
    if (max   !== null) updates.ticketMaxPerUser  = max;
    if (dm    !== null) updates.ticketDmTranscript = dm;
    if (delay !== null) updates.ticketCloseDelay   = delay;
    await updateGuildConfig(guildId, updates);
    return interaction.editReply({ content: "✅ Ticket options updated." });
  }
  if (sub === "panel_text") {
    const updates = {};
    const title  = interaction.options.getString("title");
    const before = interaction.options.getString("before_text");
    const whyUs  = interaction.options.getString("why_us");
    if (title)  updates.ticketPanelTitle  = title;
    if (before) updates.ticketPanelBefore = before;
    if (whyUs)  updates.ticketPanelWhyUs  = whyUs;
    await updateGuildConfig(guildId, updates);
    return interaction.editReply({ content: "✅ Ticket panel text updated." });
  }
}

// ── Redeem ────────────────────────────────────────────────────────────────────
async function handleRedeem(interaction, guildId, cfg, sub) {
  const { License } = require("../../models");

  if (sub === "testmode") {
    const enabled = interaction.options.getBoolean("enabled");
    await updateGuildConfig(guildId, { redeemTestMode: enabled });
    return interaction.editReply(
      cv2(enabled ? 0xFEE75C : 0x57F287,
        enabled ? "# ⚠️ Redeem Test Mode ENABLED" : "# ✅ Redeem Test Mode Disabled",
        enabled
          ? "**Warning:** License validation is bypassed. Anyone can redeem any key.\nDisable this when testing is done."
          : "License validation is back to normal."
      )
    );
  }

  if (sub === "enable") {
    const key = interaction.options.getString("key").trim().toUpperCase();
    const lic = await License.findOne({ licenseKey: key });
    if (!lic) return interaction.editReply({ content: `❌ License \`${key}\` not found.` });
    lic.redeemEnabled = true;
    await lic.save();
    return interaction.editReply({ content: `✅ Redeem enabled for \`${key}\`. Users can now redeem this key with \`/redeem\`.` });
  }

  if (sub === "disable") {
    const key = interaction.options.getString("key").trim().toUpperCase();
    const lic = await License.findOne({ licenseKey: key });
    if (!lic) return interaction.editReply({ content: `❌ License \`${key}\` not found.` });
    lic.redeemEnabled = false;
    await lic.save();
    return interaction.editReply({ content: `✅ Redeem disabled for \`${key}\`.` });
  }

  if (sub === "reset") {
    const key = interaction.options.getString("key").trim().toUpperCase();
    const lic = await License.findOne({ licenseKey: key });
    if (!lic) return interaction.editReply({ content: `❌ License \`${key}\` not found.` });
    lic.redeemedBy  = null;
    lic.redeemedAt  = null;
    await lic.save();
    return interaction.editReply({ content: `✅ Redeem status reset for \`${key}\`. It can be redeemed again.` });
  }
}

module.exports = { data, execute };

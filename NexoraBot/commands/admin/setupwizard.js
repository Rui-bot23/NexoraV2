/**
 * /setupwizard — One-command guided setup for Nexora
 *
 * Sends an interactive embed showing every setup step and their status,
 * so admins can see at a glance what's configured and what's missing.
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { getGuildConfig } = require("../../utils/guildConfig");
const { TicketCategory } = require("../../models");
const { hex } = require("../../utils/embeds");

const data = new SlashCommandBuilder()
  .setName("setupwizard")
  .setDescription("Interactive first-time setup guide for Nexora (Admin only)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const guildCfg  = await getGuildConfig(interaction.guild.id);
  const ticketCats = await TicketCategory.countDocuments({ guildId: interaction.guild.id });

  // ── Status checks ──────────────────────────────────────────────────────────
  const checks = {
    ticketLogs:     !!guildCfg.ticketLogChannelId,
    ticketCategory: !!guildCfg.ticketCategoryId,
    ticketRoles:    guildCfg.ticketSupportRoleIds?.length > 0,
    ticketCats:     ticketCats > 0,
    reviewChannel:  !!guildCfg.reviewChannelId,
    branding:       guildCfg.brandName !== "Nexora" || guildCfg.brandColor !== "5865F2",
  };

  const done   = Object.values(checks).filter(Boolean).length;
  const total  = Object.keys(checks).length;
  const allDone = done === total;

  const statusIcon = (ok) => ok ? "✅" : "❌";

  const color = allDone ? 0x57F287 : hex(guildCfg.brandColor || "5865F2");

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${allDone ? "🎉" : "⚙️"}  Nexora Setup Wizard`)
    .setDescription(
      allDone
        ? "**All steps complete!** Nexora is fully configured for this server."
        : `**${done}/${total} steps completed.** Run the commands below to finish setup.`
    )
    .addFields(
      {
        name: "🎫  Ticket System",
        value: [
          `${statusIcon(checks.ticketLogs)}  **Log channel** — \`/setup tickets logs channel:#channel\``,
          `${statusIcon(checks.ticketCategory)}  **Discord category** — \`/setup tickets category category:#category\``,
          `${statusIcon(checks.ticketRoles)}  **Support roles** — \`/setup tickets addrole role:@Support\``,
          `${statusIcon(checks.ticketCats)}  **Ticket categories** — \`/createticket name:... emoji:🎫 description:...\``,
          `\nOnce categories are added, send the panel:\n\`/ticketpanel channel:#support\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "⭐  Review System",
        value: [
          `${statusIcon(checks.reviewChannel)}  **Review channel** — \`/setup reviews channel channel:#reviews\``,
          `*Optional:* \`/setup reviews logs\` · \`/setup reviews adminrole\` · \`/setup reviews options\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🎨  Branding",
        value: [
          `${statusIcon(checks.branding)}  **Custom branding** — \`/setup branding set name:Nexora color:5865F2 footer:Nexora Support\``,
          `Currently: **${guildCfg.brandName}** · \`#${guildCfg.brandColor}\``,
        ].join("\n"),
        inline: false,
      },
      {
        name: "🔑  Licensing",
        value: [
          "Licensing needs no channel setup — use these commands:\n",
          "`/product create` — register a product",
          "`/license create` — generate license keys",
          "`/license info` · `/license suspend` · `/license reset`",
          "\nYour **REST API** for software validation runs at:\n`POST http://your-host:8888/api/validate`",
        ].join("\n"),
        inline: false,
      }
    )
    .setFooter({ text: `${done}/${total} steps complete  •  Nexora Setup Wizard` })
    .setTimestamp();

  // Quick action buttons
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("nexora_wizard_refresh")
      .setLabel("Refresh Status")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🔄"),
    new ButtonBuilder()
      .setCustomId("nexora_wizard_view_config")
      .setLabel("View Full Config")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📋"),
  );

  return interaction.editReply({ embeds: [embed], components: [row1] });
}

// Handle wizard button interactions (re-runs the wizard)
async function handleWizardButton(interaction) {
  if (interaction.customId === "nexora_wizard_refresh" || interaction.customId === "nexora_wizard_view_config") {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: "Only admins can use this.", ephemeral: true });
    }

    if (interaction.customId === "nexora_wizard_view_config") {
      // Redirect to /setup view output
      const { getGuildConfig } = require("../../utils/guildConfig");
      const { TicketCategory } = require("../../models");
      const guildCfg  = await getGuildConfig(interaction.guild.id);
      const ticketCats = await TicketCategory.find({ guildId: interaction.guild.id }).sort({ createdAt: 1 });

      const supportRoles = guildCfg.ticketSupportRoleIds?.length
        ? guildCfg.ticketSupportRoleIds.map(id => `<@&${id}>`).join(", ")
        : "*None set*";

      const reviewAdmins = guildCfg.reviewAdminRoleIds?.length
        ? guildCfg.reviewAdminRoleIds.map(id => `<@&${id}>`).join(", ")
        : "*None set*";

      const catLines = ticketCats.length
        ? ticketCats.map(c => `${c.emoji} **${c.name}** (\`${c.prefix}\`)`).join("\n")
        : "*No categories yet — use /createticket*";

      const embed = new EmbedBuilder()
        .setColor(hex(guildCfg.brandColor || "5865F2"))
        .setTitle("📋  Current Nexora Config")
        .addFields(
          {
            name: "🎨 Branding",
            value: `**Name:** ${guildCfg.brandName}\n**Color:** \`#${guildCfg.brandColor}\`\n**Footer:** ${guildCfg.brandFooter}`,
            inline: false,
          },
          {
            name: "🎫 Tickets",
            value: [
              `**Log Channel:** ${guildCfg.ticketLogChannelId ? `<#${guildCfg.ticketLogChannelId}>` : "❌ Not set"}`,
              `**Category:** ${guildCfg.ticketCategoryId ? `<#${guildCfg.ticketCategoryId}>` : "❌ Not set"}`,
              `**Support Roles:** ${supportRoles}`,
              `**Max per User:** ${guildCfg.ticketMaxPerUser} · **DM Transcript:** ${guildCfg.ticketDmTranscript ? "✅" : "❌"} · **Ratings:** ${guildCfg.ticketRatingsEnabled ? "✅" : "❌"}`,
            ].join("\n"),
            inline: false,
          },
          {
            name: `🎫 Ticket Categories (${ticketCats.length})`,
            value: catLines,
            inline: false,
          },
          {
            name: "⭐ Reviews",
            value: [
              `**Channel:** ${guildCfg.reviewChannelId ? `<#${guildCfg.reviewChannelId}>` : "❌ Not set"}`,
              `**Log Channel:** ${guildCfg.reviewLogChannelId ? `<#${guildCfg.reviewLogChannelId}>` : "*Not set*"}`,
              `**Admin Roles:** ${reviewAdmins}`,
              `**Allow Images:** ${guildCfg.reviewAllowImages ? "✅" : "❌"} · **Max Length:** ${guildCfg.reviewMaxLength} · **Cooldown:** ${guildCfg.reviewCooldown}s`,
            ].join("\n"),
            inline: false,
          }
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // Refresh — rerun execute
    return execute({ ...interaction, deferReply: (o) => interaction.deferReply(o), editReply: (o) => interaction.editReply(o) });
  }
}

module.exports = { data, execute, handleWizardButton };

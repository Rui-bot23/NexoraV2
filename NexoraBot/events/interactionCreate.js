/**
 * events/interactionCreate.js
 * Routes slash commands, autocomplete, buttons, select menus, and modals
 */

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionsBitField,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const { Ticket, Review, TicketCategory } = require("../models");
const { getGuildConfig } = require("../utils/guildConfig");
const { isStaffMember } = require("../utils/guildConfig");
const { successEmbed, errorEmbed, infoEmbed, warningEmbed, brandEmbed, hex } = require("../utils/embeds");

const once = false;

async function execute(interaction, client) {

  // ── Autocomplete ────────────────────────────────────────────────────────────
  if (interaction.isAutocomplete()) {
    const cmd = client.commands?.get(interaction.commandName);
    if (cmd?.autocomplete) await cmd.autocomplete(interaction).catch(console.error);
    return;
  }


  // ── Autocomplete ────────────────────────────────────────────────────────────
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (command?.autocomplete) {
      try { await command.autocomplete(interaction); } catch (err) { console.error(err); }
    }
    return;
  }

  // ── Slash Commands ──────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction);
    } catch (err) {
      console.error(`[CMD ERROR] /${interaction.commandName}:`, err);
      const payload = { embeds: [errorEmbed("Command Error", `An error occurred: ${err.message}`)], ephemeral: true };
      if (interaction.replied || interaction.deferred) {
        await interaction.editReply(payload).catch(() => {});
      } else {
        await interaction.reply(payload).catch(() => {});
      }
    }
    return;
  }

  // ── Select Menu — Ticket Category ──────────────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === "nexora_ticket_category") {
    const selectedValue = interaction.values[0]; // e.g. "nexora_open_<uuid>"
    const categoryId = selectedValue.replace("nexora_open_", "");

    const guildCfg = await getGuildConfig(interaction.guild.id);
    const category = await TicketCategory.findOne({ categoryId });

    if (!category) {
      return interaction.reply({
        embeds: [errorEmbed("Unknown Category", "That category no longer exists. Ask an admin to run `/ticketpanel` again.")],
        ephemeral: true,
      });
    }

    // Check max open tickets
    const maxOpen = guildCfg.ticketMaxPerUser ?? 1;
    const existing = await Ticket.countDocuments({
      ownerId: interaction.user.id,
      guildId: interaction.guild.id,
      status: "open",
    });
    if (existing >= maxOpen) {
      return interaction.reply({
        embeds: [warningEmbed("Ticket Limit Reached",
          `You already have **${existing}** open ticket${existing !== 1 ? "s" : ""}. Please wait for ${existing !== 1 ? "them" : "it"} to be resolved.`)],
        ephemeral: true,
      });
    }

    // Show modal
    const modal = new ModalBuilder()
      .setCustomId(`nexora_ticket_modal_${categoryId}`)
      .setTitle(`${category.emoji} ${category.name}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ticket_subject")
          .setLabel("Subject")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("Brief summary of your issue")
          .setRequired(true)
          .setMaxLength(100)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("ticket_description")
          .setLabel("Description")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("Describe your issue in detail...")
          .setRequired(true)
          .setMaxLength(1000)
      )
    );

    return interaction.showModal(modal);
  }

  // ── Modal Submit — Ticket Open ──────────────────────────────────────────────
  if (interaction.isModalSubmit() && interaction.customId.startsWith("nexora_ticket_modal_")) {
    await interaction.deferReply({ ephemeral: true });

    const categoryId  = interaction.customId.replace("nexora_ticket_modal_", "");
    const category    = await TicketCategory.findOne({ categoryId });
    const guildCfg    = await getGuildConfig(interaction.guild.id);
    const subject     = interaction.fields.getTextInputValue("ticket_subject");
    const description = interaction.fields.getTextInputValue("ticket_description");

    if (!category) {
      return interaction.editReply({ embeds: [errorEmbed("Category Gone", "That ticket category was deleted.")] });
    }

    const ticketId = `${category.prefix.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // Resolve or create the Discord category
    let discordCat = null;
    if (guildCfg.ticketCategoryId) {
      discordCat = interaction.guild.channels.cache.get(guildCfg.ticketCategoryId);
    }
    if (!discordCat) {
      discordCat = await interaction.guild.channels.create({
        name: "🎫 NEXORA TICKETS",
        type: ChannelType.GuildCategory,
      });
      // Save for future use
      const { updateGuildConfig } = require("../utils/guildConfig");
      await updateGuildConfig(interaction.guild.id, { ticketCategoryId: discordCat.id });
    }

    // Build permission overwrites
    const overwrites = [
      { id: interaction.guild.roles.everyone.id, deny: [PermissionsBitField.Flags.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
          PermissionsBitField.Flags.AttachFiles,
        ],
      },
    ];

    // Add support roles from DB config
    for (const roleId of (guildCfg.ticketSupportRoleIds || [])) {
      const role = interaction.guild.roles.cache.get(roleId);
      if (role) {
        overwrites.push({
          id: role.id,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages,
            PermissionsBitField.Flags.AttachFiles,
          ],
        });
      }
    }

    const channelName = `${category.prefix}-${interaction.user.username}`
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .slice(0, 50);

    const channel = await interaction.guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: discordCat.id,
      permissionOverwrites: overwrites,
    });

    await Ticket.create({
      ticketId,
      channelId:   channel.id,
      guildId:     interaction.guild.id,
      ownerId:     interaction.user.id,
      ownerTag:    interaction.user.tag,
      category:    category.name,
      subject,
      description,
    });

    // Ticket intro embed
    const color = hex(guildCfg.brandColor || "5865F2");
    const introEmbed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${category.emoji} ${category.name} — \`${ticketId}\``)
      .setDescription(
        `Welcome ${interaction.user}! A member of our support team will be with you shortly.\n\n` +
        `**Subject:** ${subject}\n` +
        `**Description:** ${description}`
      )
      .addFields({ name: "⚡ Priority", value: "Normal", inline: true })
      .setFooter({ text: guildCfg.brandFooter || "Nexora Support" })
      .setTimestamp();

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`nexora_ticket_close_${ticketId}`)
        .setLabel("Close Ticket")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("🔒"),
      new ButtonBuilder()
        .setCustomId(`nexora_ticket_claim_${ticketId}`)
        .setLabel("Claim")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("✋"),
    );

    // Build ping content
    let pingContent = `${interaction.user}`;
    if (category.teamPingId) {
      const pingRole = interaction.guild.roles.cache.get(category.teamPingId);
      if (pingRole) pingContent += ` | ${pingRole}`;
    } else if (guildCfg.ticketSupportRoleIds?.length) {
      pingContent += ` | <@&${guildCfg.ticketSupportRoleIds[0]}>`;
    }

    await channel.send({ content: pingContent, embeds: [introEmbed], components: [actionRow] });

    return interaction.editReply({
      embeds: [successEmbed("Ticket Opened", `Your ticket has been created: ${channel}`)],
    });
  }

  // ── Button — Ticket Close ───────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("nexora_ticket_close_")) {
    const guildCfg = await getGuildConfig(interaction.guild.id);
    const ticket   = await Ticket.findOne({ channelId: interaction.channel.id, status: "open" });

    if (!ticket) return interaction.reply({ embeds: [errorEmbed("Not a Ticket", "This is not an open ticket.")], ephemeral: true });

    const isOwner = interaction.user.id === ticket.ownerId;
    const staff   = isStaffMember(interaction.member, guildCfg);
    if (!isOwner && !staff) {
      return interaction.reply({ embeds: [errorEmbed("No Permission", "Only the ticket owner or staff can close this ticket.")], ephemeral: true });
    }

    await interaction.deferReply();
    ticket.status   = "closed";
    ticket.closedAt = Date.now();
    await ticket.save();

    const closeEmbed = new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle("🔒 Ticket Closed")
      .setDescription(`Closed by **${interaction.user.tag}**.`)
      .setTimestamp();

    await interaction.editReply({ embeds: [closeEmbed] });
    await postTranscript(interaction.channel, ticket, interaction.guild, guildCfg);

    const delay = (guildCfg.ticketCloseDelay ?? 5) * 1000;
    setTimeout(() => interaction.channel.delete().catch(() => {}), delay);
    return;
  }

  // ── Button — Ticket Claim ───────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("nexora_ticket_claim_")) {
    const guildCfg = await getGuildConfig(interaction.guild.id);
    if (!isStaffMember(interaction.member, guildCfg)) {
      return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can claim tickets.")], ephemeral: true });
    }

    const ticket = await Ticket.findOne({ channelId: interaction.channel.id, status: "open" });
    if (!ticket) return interaction.reply({ embeds: [errorEmbed("Not a Ticket", "This is not an open ticket.")], ephemeral: true });

    if (ticket.claimedBy && ticket.claimedBy !== interaction.user.id) {
      return interaction.reply({ embeds: [warningEmbed("Already Claimed", `Already claimed by <@${ticket.claimedBy}>.`)], ephemeral: true });
    }

    ticket.claimedBy = interaction.user.id;
    await ticket.save();
    return interaction.reply({ embeds: [successEmbed("Claimed", `${interaction.user} is now handling this ticket.`)] });
  }

  // ── Button — Setup Wizard ──────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("nexora_wizard_")) {
    const { handleWizardButton } = require("../commands/admin/setupwizard");
    return handleWizardButton(interaction);
  }

  // ── Button — Giveaway ──────────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("nexora_giveaway_")) {
    const { handleGiveawayButton } = require("../commands/giveaway/giveaway");
    return handleGiveawayButton(interaction).catch(console.error);
  }

  // ── Button — Review Delete ──────────────────────────────────────────────────
  if (interaction.isButton() && interaction.customId.startsWith("nexora_review_delete_")) {
    const guildCfg  = await getGuildConfig(interaction.guild.id);
    const isAdmin   = interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator);
    const isRevAdmin = isAdmin || interaction.member?.roles.cache.some(r => (guildCfg.reviewAdminRoleIds || []).includes(r.id));

    if (!isRevAdmin) {
      return interaction.reply({ embeds: [errorEmbed("No Permission", "Only review admins can delete reviews.")], ephemeral: true });
    }

    const reviewId = interaction.customId.replace("nexora_review_delete_", "");
    const { Review } = require("../models");
    const review = await Review.findOneAndDelete({ reviewId });
    if (!review) return interaction.reply({ embeds: [errorEmbed("Not Found", "Review already deleted.")], ephemeral: true });

    await interaction.message.delete().catch(() => {});
    return interaction.reply({ embeds: [successEmbed("Deleted", `Review \`${reviewId}\` removed.`)], ephemeral: true });
  }
}

// ── Transcript helper ─────────────────────────────────────────────────────────
async function postTranscript(channel, ticket, guild, guildCfg) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted   = [...messages.values()].reverse();
    const lines    = sorted.map(m =>
      `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || "(embed/attachment)"}`
    ).join("\n");

    const { AttachmentBuilder } = require("discord.js");

    if (guildCfg.ticketLogChannelId) {
      const logCh = guild.channels.cache.get(guildCfg.ticketLogChannelId);
      if (logCh) {
        const embed = new EmbedBuilder()
          .setColor(0xFEE75C)
          .setTitle(`📋 Transcript — ${ticket.ticketId}`)
          .addFields(
            { name: "Category", value: ticket.category,        inline: true },
            { name: "Owner",    value: `<@${ticket.ownerId}>`, inline: true },
            { name: "Closed",   value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
          )
          .setTimestamp();
        const att = new AttachmentBuilder(Buffer.from(lines, "utf8"), { name: `transcript-${ticket.ticketId}.txt` });
        await logCh.send({ embeds: [embed], files: [att] });
      }
    }

    if (guildCfg.ticketDmTranscript) {
      try {
        const owner = await guild.members.fetch(ticket.ownerId);
        const att2  = new AttachmentBuilder(Buffer.from(lines, "utf8"), { name: `transcript-${ticket.ticketId}.txt` });
        await owner.send({
          embeds: [new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("Your ticket has been closed")
            .setDescription(`Ticket \`${ticket.ticketId}\` in **${guild.name}** was closed. Transcript attached.`)
            .setTimestamp()],
          files: [att2],
        });
      } catch {}
    }
  } catch (err) {
    console.error("[TRANSCRIPT]", err.message);
  }
}

// ── Button — Setup Wizard ───────────────────────────────────────────────────
// (handled inline here to avoid circular require)

module.exports = { once, execute };

// NOTE: wizard button handler appended below — matches nexora_wizard_* customIds

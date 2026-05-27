/**
 * /ticket — Staff ticket management
 * close | claim | unclaim | add | remove | rename | priority | list | stats
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
} = require("discord.js");
const { Ticket } = require("../../models");
const { getGuildConfig, isStaffMember } = require("../../utils/guildConfig");
const { successEmbed, errorEmbed, infoEmbed, warningEmbed, hex } = require("../../utils/embeds");

const PRIORITY_COLORS = { Low: 0x57F287, Normal: 0x5865F2, High: 0xFEE75C, Critical: 0xED4245 };

const data = new SlashCommandBuilder()
  .setName("ticket")
  .setDescription("Manage tickets")
  .addSubcommand(sub => sub.setName("close").setDescription("Close this ticket").addStringOption(o => o.setName("reason").setDescription("Reason")))
  .addSubcommand(sub => sub.setName("claim").setDescription("Claim this ticket"))
  .addSubcommand(sub => sub.setName("unclaim").setDescription("Unclaim this ticket"))
  .addSubcommand(sub => sub.setName("add").setDescription("Add a user to this ticket").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
  .addSubcommand(sub => sub.setName("remove").setDescription("Remove a user from this ticket").addUserOption(o => o.setName("user").setDescription("User").setRequired(true)))
  .addSubcommand(sub => sub.setName("rename").setDescription("Rename this channel").addStringOption(o => o.setName("name").setDescription("New name").setRequired(true)))
  .addSubcommand(sub =>
    sub.setName("priority").setDescription("Set priority")
      .addStringOption(o => o.setName("level").setDescription("Priority level").setRequired(true)
        .addChoices({ name: "Low", value: "Low" }, { name: "Normal", value: "Normal" }, { name: "High", value: "High" }, { name: "Critical", value: "Critical" }))
  )
  .addSubcommand(sub => sub.setName("list").setDescription("List open tickets").addUserOption(o => o.setName("user").setDescription("Filter by user")))
  .addSubcommand(sub => sub.setName("stats").setDescription("Ticket statistics"));

async function execute(interaction) {
  const guildCfg = await getGuildConfig(interaction.guild.id);
  const sub      = interaction.options.getSubcommand();

  try {
    if (sub === "close")    return await doClose(interaction, guildCfg);
    if (sub === "claim")    return await doClaim(interaction, guildCfg, true);
    if (sub === "unclaim")  return await doClaim(interaction, guildCfg, false);
    if (sub === "add")      return await doAddRemove(interaction, guildCfg, true);
    if (sub === "remove")   return await doAddRemove(interaction, guildCfg, false);
    if (sub === "rename")   return await doRename(interaction, guildCfg);
    if (sub === "priority") return await doPriority(interaction, guildCfg);
    if (sub === "list")     return await doList(interaction, guildCfg);
    if (sub === "stats")    return await doStats(interaction, guildCfg);
  } catch (err) {
    console.error("[TICKET CMD]", err);
    const p = { embeds: [errorEmbed("Error", err.message)], ephemeral: true };
    return interaction.replied || interaction.deferred ? interaction.editReply(p) : interaction.reply(p);
  }
}

async function doClose(interaction, guildCfg) {
  const reason = interaction.options.getString("reason") || "No reason provided";
  const ticket = await Ticket.findOne({ channelId: interaction.channel.id, status: "open" });
  if (!ticket) return interaction.reply({ embeds: [errorEmbed("Not a Ticket", "This is not an open ticket.")], ephemeral: true });

  const isOwner = interaction.user.id === ticket.ownerId;
  if (!isOwner && !isStaffMember(interaction.member, guildCfg)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only the owner or staff can close tickets.")], ephemeral: true });
  }

  await interaction.deferReply();
  ticket.status = "closed"; ticket.closedAt = Date.now();
  await ticket.save();

  const embed = new EmbedBuilder().setColor(0xED4245).setTitle("🔒 Ticket Closed")
    .setDescription(`Closed by **${interaction.user.tag}**\n**Reason:** ${reason}`).setTimestamp();
  await interaction.editReply({ embeds: [embed] });

  const { postTranscript } = require("../tickets/transcriptHelper");
  await postTranscript(interaction.channel, ticket, interaction.guild, guildCfg);

  const delay = (guildCfg.ticketCloseDelay ?? 5) * 1000;
  setTimeout(() => interaction.channel.delete().catch(() => {}), delay);
}

async function doClaim(interaction, guildCfg, claim) {
  if (!isStaffMember(interaction.member, guildCfg)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can claim/unclaim tickets.")], ephemeral: true });
  }
  const ticket = await Ticket.findOne({ channelId: interaction.channel.id, status: "open" });
  if (!ticket) return interaction.reply({ embeds: [errorEmbed("Not a Ticket", "This is not an open ticket.")], ephemeral: true });

  if (claim) {
    ticket.claimedBy = interaction.user.id;
    await ticket.save();
    return interaction.reply({ embeds: [successEmbed("Claimed", `${interaction.user} is now handling this ticket.`)] });
  } else {
    ticket.claimedBy = null;
    await ticket.save();
    return interaction.reply({ embeds: [infoEmbed("Unclaimed", `${interaction.user} unclaimed this ticket.`)] });
  }
}

async function doAddRemove(interaction, guildCfg, add) {
  if (!isStaffMember(interaction.member, guildCfg)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can add/remove users.")], ephemeral: true });
  }
  const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
  if (!ticket) return interaction.reply({ embeds: [errorEmbed("Not a Ticket", "This is not a ticket channel.")], ephemeral: true });

  const user   = interaction.options.getUser("user");
  const member = await interaction.guild.members.fetch(user.id).catch(() => null);
  if (!member) return interaction.reply({ embeds: [errorEmbed("Not Found", "Member not in server.")], ephemeral: true });

  if (add) {
    await interaction.channel.permissionOverwrites.edit(member, { ViewChannel: true, SendMessages: true });
    return interaction.reply({ embeds: [successEmbed("User Added", `${user} added to this ticket.`)] });
  } else {
    await interaction.channel.permissionOverwrites.delete(member);
    return interaction.reply({ embeds: [successEmbed("User Removed", `${user} removed from this ticket.`)] });
  }
}

async function doRename(interaction, guildCfg) {
  if (!isStaffMember(interaction.member, guildCfg)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can rename tickets.")], ephemeral: true });
  }
  const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
  if (!ticket) return interaction.reply({ embeds: [errorEmbed("Not a Ticket", "Not a ticket channel.")], ephemeral: true });

  const newName = interaction.options.getString("name").toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 50);
  await interaction.channel.setName(newName);
  return interaction.reply({ embeds: [successEmbed("Renamed", `Channel renamed to **${newName}**.`)] });
}

async function doPriority(interaction, guildCfg) {
  if (!isStaffMember(interaction.member, guildCfg)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can set priority.")], ephemeral: true });
  }
  const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
  if (!ticket) return interaction.reply({ embeds: [errorEmbed("Not a Ticket", "Not a ticket channel.")], ephemeral: true });

  const level = interaction.options.getString("level");
  ticket.priority = level; await ticket.save();

  return interaction.reply({
    embeds: [new EmbedBuilder().setColor(PRIORITY_COLORS[level] || 0x5865F2)
      .setTitle(`Priority → ${level}`).setDescription(`This ticket is now **${level}** priority.`).setTimestamp()],
  });
}

async function doList(interaction, guildCfg) {
  if (!isStaffMember(interaction.member, guildCfg)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "Only staff can list tickets.")], ephemeral: true });
  }
  const userFilter = interaction.options.getUser("user");
  const query = { guildId: interaction.guild.id, status: "open" };
  if (userFilter) query.ownerId = userFilter.id;

  const tickets = await Ticket.find(query).sort({ createdAt: -1 }).limit(20);
  if (!tickets.length) {
    return interaction.reply({ embeds: [infoEmbed("No Open Tickets", "No open tickets found.")], ephemeral: true });
  }

  const lines = tickets.map(t => {
    const ch = interaction.guild.channels.cache.get(t.channelId);
    return `${ch ? `<#${t.channelId}>` : `\`${t.ticketId}\``} — **${t.category}** — <@${t.ownerId}> — ${t.priority}`;
  });

  return interaction.reply({ embeds: [infoEmbed(`Open Tickets (${tickets.length})`, lines.join("\n"))], ephemeral: true });
}

async function doStats(interaction, guildCfg) {
  const guildId = interaction.guild.id;
  const [total, open, closed] = await Promise.all([
    Ticket.countDocuments({ guildId }),
    Ticket.countDocuments({ guildId, status: "open" }),
    Ticket.countDocuments({ guildId, status: "closed" }),
  ]);

  const catBreakdown = await Ticket.aggregate([
    { $match: { guildId } },
    { $group: { _id: "$category", count: { $sum: 1 } } },
    { $sort: { count: -1 } }, { $limit: 5 },
  ]);

  const catLines = catBreakdown.map(c => `**${c._id}:** ${c.count}`).join("\n") || "*None*";

  return interaction.reply({
    embeds: [infoEmbed("Ticket Statistics", "Server-wide ticket stats")
      .addFields(
        { name: "📊 Total", value: `${total}`, inline: true },
        { name: "🟢 Open",  value: `${open}`,  inline: true },
        { name: "🔴 Closed",value: `${closed}`,inline: true },
        { name: "📂 Top Categories", value: catLines, inline: false },
      )],
    ephemeral: true,
  });
}

module.exports = { data, execute };

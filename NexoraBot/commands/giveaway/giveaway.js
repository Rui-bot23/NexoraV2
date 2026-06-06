/**
 * Advanced Giveaway System — inspired by Winnsy (WilliamJacksons/Giveaway-Bot-Winnsy)
 * Upgraded to Components V2
 *
 * Features from Winnsy:
 * - Persistent giveaways (survive restarts via MongoDB)
 * - Pause/resume with timer freeze
 * - Role requirements + multipliers
 * - Account age filter
 * - Booster-only option
 * - Reroll, edit, duplicate, cancel
 * - Analytics per giveaway
 * - Server-wide settings
 *
 * /giveaway start | end | reroll | cancel | pause | resume | edit | duplicate | list | analytics | settings
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
  ChannelType,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const { Giveaway } = require("../../models");
const { getGuildConfig, updateGuildConfig } = require("../../utils/guildConfig");

// ── In-memory timers ──────────────────────────────────────────────────────────
const timers = new Map(); // giveawayId -> setTimeout handle

function parseDuration(str) {
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  const m   = str.match(/^(\d+)([smhd])$/i);
  if (!m) return null;
  return parseInt(m[1]) * (map[m[2].toLowerCase()] || 0);
}

function formatMs(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), min = Math.floor((s % 3600) / 60);
  if (h > 24) return `${Math.floor(h/24)}d ${h%24}h`;
  if (h > 0)  return `${h}h ${min}m`;
  return `${min}m`;
}

function getWeightedParticipants(participants, multipliers) {
  if (!multipliers?.length) return participants;
  // multipliers: ["roleId:weight", ...]
  // We can't check roles here without guild — returns flat list (weighting applied on entry)
  return participants;
}

function pickWinners(participants, count) {
  if (!participants.length) return [];
  const shuffled = [...participants].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// ── Build giveaway Components V2 message ──────────────────────────────────────
function buildGiveawayPayload(gw, ended = false) {
  const timeField = ended
    ? `**Ended:** <t:${Math.floor(Date.now() / 1000)}:R>`
    : `**Ends:** <t:${Math.floor(gw.endsAt / 1000)}:R>`;

  const statusLine = gw.paused
    ? "⏸️ **PAUSED**"
    : ended
      ? "🏁 **ENDED**"
      : "🟢 **ACTIVE**";

  const winnerLine = ended && gw.winners.length
    ? `\n🏆 **Winners:** ${gw.winners.map(id => `<@${id}>`).join(", ")}`
    : "";

  const reqLines = [];
  if (gw.requiredRoles?.length) reqLines.push(`🔑 Required roles: ${gw.requiredRoles.map(id => `<@&${id}>`).join(", ")}`);
  if (gw.minAccountDays > 0)    reqLines.push(`📅 Account age: ${gw.minAccountDays}+ days`);
  if (gw.nitroBoosterOnly)      reqLines.push(`💎 Nitro Boosters only`);
  if (gw.roleMultipliers?.length) {
    const mults = gw.roleMultipliers.map(m => {
      const [roleId, weight] = m.split(":");
      return `<@&${roleId}> ×${weight}`;
    });
    reqLines.push(`✨ Multipliers: ${mults.join(", ")}`);
  }

  const container = new ContainerBuilder()
    .setAccentColor(ended ? 0x808080 : gw.paused ? 0xFEE75C : 0x57F287)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# 🎉 GIVEAWAY — ${gw.prize}`)
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          statusLine,
          gw.description ? `\n${gw.description}` : null,
          "",
          timeField,
          `🎯 **Winners:** ${gw.winnerCount}`,
          `👥 **Entries:** ${gw.participants.length}`,
          `👤 **Hosted by:** <@${gw.hostedBy}>`,
          winnerLine,
          reqLines.length ? "\n**Requirements:**\n" + reqLines.join("\n") : null,
        ].filter(v => v !== null).join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        ended
          ? `-# Giveaway ended • ID: \`${gw.giveawayId}\``
          : `-# Click 🎉 to enter • ID: \`${gw.giveawayId}\``
      )
    );

  const row = !ended ? new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`nexora_giveaway_enter_${gw.giveawayId}`)
      .setLabel(`Enter (${gw.participants.length})`)
      .setStyle(ButtonStyle.Success)
      .setEmoji("🎉")
      .setDisabled(gw.paused),
    new ButtonBuilder()
      .setCustomId(`nexora_giveaway_leave_${gw.giveawayId}`)
      .setLabel("Leave")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("🚪"),
    new ButtonBuilder()
      .setCustomId(`nexora_giveaway_check_${gw.giveawayId}`)
      .setLabel("Check Status")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("📊"),
  ) : null;

  const components = [container];
  if (row) components.push(row);

  return { components, flags: MessageFlags.IsComponentsV2 };
}

// ── End a giveaway ────────────────────────────────────────────────────────────
async function endGiveaway(giveawayId, guild) {
  if (timers.has(giveawayId)) {
    clearTimeout(timers.get(giveawayId));
    timers.delete(giveawayId);
  }

  const gw = await Giveaway.findOne({ giveawayId });
  if (!gw || gw.ended) return;

  const winners = pickWinners(gw.participants, gw.winnerCount);
  gw.winners = winners;
  gw.ended   = true;
  await gw.save();

  try {
    const channel = guild.channels.cache.get(gw.channelId);
    if (!channel) return;
    const msg = await channel.messages.fetch(gw.messageId).catch(() => null);
    if (msg) await msg.edit(buildGiveawayPayload(gw, true));

    const cfg = await getGuildConfig(guild.id);
    const logChId = cfg.giveawayLogChannelId;

    if (winners.length) {
      await channel.send({
        content: winners.map(id => `<@${id}>`).join(" "),
        embeds: [
          new EmbedBuilder()
            .setColor(0x57F287)
            .setTitle("🎉 Giveaway Winners!")
            .setDescription(`Congratulations! ${winners.map(id => `<@${id}>`).join(", ")} won **${gw.prize}**!`)
            .setFooter({ text: `ID: ${giveawayId}` })
            .setTimestamp(),
        ],
        allowedMentions: { users: winners },
      });

      // DM winners
      for (const winnerId of winners) {
        try {
          const member = await guild.members.fetch(winnerId);
          await member.send({
            embeds: [
              new EmbedBuilder()
                .setColor(0x57F287)
                .setTitle("🎉 You won a Giveaway!")
                .setDescription(`You won **${gw.prize}** in **${guild.name}**!`)
                .setTimestamp(),
            ],
          });
        } catch {}
      }
    } else {
      await channel.send({ content: "No valid entries. No winner drawn. 😢" });
    }

    // Log
    if (logChId) {
      const logCh = guild.channels.cache.get(logChId);
      logCh?.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x5865F2)
            .setTitle("📋 Giveaway Ended")
            .addFields(
              { name: "Prize",    value: gw.prize,                                              inline: true },
              { name: "Winners",  value: winners.length ? winners.map(id=>`<@${id}>`).join(", ") : "None", inline: true },
              { name: "Entries",  value: `${gw.participants.length}`,                           inline: true },
              { name: "ID",       value: `\`${giveawayId}\``,                                  inline: true },
            )
            .setTimestamp(),
        ],
      });
    }
  } catch (err) {
    console.error("[GIVEAWAY END]", err.message);
  }
}

// ── Schedule a giveaway ───────────────────────────────────────────────────────
function scheduleGiveaway(gw, guild) {
  if (timers.has(gw.giveawayId)) clearTimeout(timers.get(gw.giveawayId));
  const remaining = gw.paused ? (gw.remainingMs || 0) : (gw.endsAt - Date.now());
  if (remaining <= 0) { endGiveaway(gw.giveawayId, guild); return; }
  const handle = setTimeout(() => endGiveaway(gw.giveawayId, guild), remaining);
  timers.set(gw.giveawayId, handle);
}

// ── Restore active giveaways on bot start ─────────────────────────────────────
async function restoreGiveaways(client) {
  try {
    const active = await Giveaway.find({ ended: false, paused: false });
    for (const gw of active) {
      const guild = client.guilds.cache.get(gw.guildId);
      if (guild) scheduleGiveaway(gw, guild);
    }
    if (active.length) console.log(`[GIVEAWAY] Restored ${active.length} active giveaway(s)`);
  } catch (err) {
    console.error("[GIVEAWAY RESTORE]", err.message);
  }
}

// ── Button handlers ───────────────────────────────────────────────────────────
async function handleGiveawayButton(interaction) {
  const customId     = interaction.customId;
  const giveawayId   = customId.split("_").pop();
  const gw           = await Giveaway.findOne({ giveawayId });

  if (!gw || gw.ended) {
    return interaction.reply({ content: "❌ This giveaway has ended.", flags: 64 });
  }

  // ── Enter ─────────────────────────────────────────────────────────────────
  if (customId.startsWith("nexora_giveaway_enter_")) {
    if (gw.paused) return interaction.reply({ content: "⏸️ This giveaway is paused.", flags: 64 });
    if (gw.participants.includes(interaction.user.id)) {
      return interaction.reply({ content: "⚠️ You are already entered!", flags: 64 });
    }

    // Requirements check
    const member = interaction.member;
    if (gw.requiredRoles?.length) {
      const hasAll = gw.requiredRoles.every(id => member.roles.cache.has(id));
      if (!hasAll) return interaction.reply({ content: "❌ You don't have the required roles.", flags: 64 });
    }
    if (gw.nitroBoosterOnly && !member.premiumSince) {
      return interaction.reply({ content: "❌ This giveaway is for Nitro Boosters only.", flags: 64 });
    }
    if (gw.minAccountDays > 0) {
      const ageDays = (Date.now() - interaction.user.createdTimestamp) / 86400000;
      if (ageDays < gw.minAccountDays) {
        return interaction.reply({ content: `❌ Your account must be at least **${gw.minAccountDays}** days old.`, flags: 64 });
      }
    }

    // Apply multipliers
    const entries = [interaction.user.id];
    if (gw.roleMultipliers?.length) {
      for (const mult of gw.roleMultipliers) {
        const [roleId, weight] = mult.split(":");
        if (member.roles.cache.has(roleId)) {
          const extra = Math.max(0, parseInt(weight || 1) - 1);
          for (let i = 0; i < extra; i++) entries.push(interaction.user.id);
        }
      }
    }

    gw.participants.push(...entries);
    await gw.save();

    // Update embed
    try {
      const payload = buildGiveawayPayload(gw);
      // Update button label
      if (payload.components?.[1]) {
        payload.components[1].components[0].setLabel(`Enter (${gw.participants.filter((v,i,a)=>a.indexOf(v)===i).length})`);
      }
      await interaction.message.edit(payload);
    } catch {}

    return interaction.reply({ content: `✅ You entered the **${gw.prize}** giveaway! Good luck! 🎉`, flags: 64 });
  }

  // ── Leave ─────────────────────────────────────────────────────────────────
  if (customId.startsWith("nexora_giveaway_leave_")) {
    if (!gw.participants.includes(interaction.user.id)) {
      return interaction.reply({ content: "❌ You are not in this giveaway.", flags: 64 });
    }
    gw.participants = gw.participants.filter(id => id !== interaction.user.id);
    await gw.save();
    try { await interaction.message.edit(buildGiveawayPayload(gw)); } catch {}
    return interaction.reply({ content: "✅ You have left the giveaway.", flags: 64 });
  }

  // ── Check Status ──────────────────────────────────────────────────────────
  if (customId.startsWith("nexora_giveaway_check_")) {
    const member     = interaction.member;
    const entered    = gw.participants.includes(interaction.user.id);
    const checks     = [];

    checks.push(`${entered ? "✅" : "❌"} Entered`);
    if (gw.requiredRoles?.length) {
      const has = gw.requiredRoles.every(id => member.roles.cache.has(id));
      checks.push(`${has ? "✅" : "❌"} Required roles`);
    }
    if (gw.nitroBoosterOnly) {
      checks.push(`${member.premiumSince ? "✅" : "❌"} Nitro Booster`);
    }
    if (gw.minAccountDays > 0) {
      const days = Math.floor((Date.now() - interaction.user.createdTimestamp) / 86400000);
      checks.push(`${days >= gw.minAccountDays ? "✅" : "❌"} Account age (${days}/${gw.minAccountDays} days)`);
    }

    return interaction.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(entered ? 0x57F287 : 0xED4245)
          .setTitle(`📊 Giveaway Status — ${gw.prize}`)
          .setDescription(checks.join("\n"))
          .setFooter({ text: `ID: ${giveawayId}` })
          .setTimestamp(),
      ],
      flags: 64,
    });
  }
}

// ── Slash Command ─────────────────────────────────────────────────────────────
const data = new SlashCommandBuilder()
  .setName("giveaway")
  .setDescription("Advanced giveaway system")

  .addSubcommand(s => s.setName("start").setDescription("Start a new giveaway")
    .addStringOption(o => o.setName("prize").setDescription("What are you giving away?").setRequired(true))
    .addStringOption(o => o.setName("duration").setDescription("Duration (e.g. 1h, 30m, 2d)").setRequired(true))
    .addIntegerOption(o => o.setName("winners").setDescription("Number of winners").setMinValue(1).setMaxValue(20))
    .addStringOption(o => o.setName("description").setDescription("Giveaway description"))
    .addChannelOption(o => o.setName("channel").setDescription("Channel to post in").addChannelTypes(ChannelType.GuildText))
    .addRoleOption(o => o.setName("required_role").setDescription("Required role to enter"))
    .addIntegerOption(o => o.setName("min_account_days").setDescription("Minimum account age in days").setMinValue(0))
    .addBooleanOption(o => o.setName("nitro_only").setDescription("Nitro Boosters only"))
    .addStringOption(o => o.setName("multiplier").setDescription("Role multiplier: @role:weight (e.g. use role ID:3)"))
  )
  .addSubcommand(s => s.setName("end").setDescription("End a giveaway early").addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand(s => s.setName("reroll").setDescription("Reroll winners").addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setAutocomplete(true)).addIntegerOption(o => o.setName("count").setDescription("Number of new winners").setMinValue(1).setMaxValue(20)))
  .addSubcommand(s => s.setName("cancel").setDescription("Cancel a giveaway").addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand(s => s.setName("pause").setDescription("Pause a giveaway").addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand(s => s.setName("resume").setDescription("Resume a paused giveaway").addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand(s => s.setName("duplicate").setDescription("Duplicate a giveaway").addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName("duration").setDescription("New duration").setRequired(true)))
  .addSubcommand(s => s.setName("list").setDescription("List active giveaways"))
  .addSubcommand(s => s.setName("analytics").setDescription("View giveaway analytics").addStringOption(o => o.setName("id").setDescription("Giveaway ID").setRequired(true).setAutocomplete(true)))
  .addSubcommand(s => s.setName("settings").setDescription("Server-wide giveaway settings")
    .addChannelOption(o => o.setName("log_channel").setDescription("Log channel for giveaway events").addChannelTypes(ChannelType.GuildText))
    .addRoleOption(o => o.setName("manager_role").setDescription("Role that can manage giveaways"))
  );

function canManageGiveaway(interaction, cfg) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  if (cfg.giveawayManagerRoleId && interaction.member.roles.cache.has(cfg.giveawayManagerRoleId)) return true;
  return false;
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const cfg = await getGuildConfig(interaction.guild.id);

  if (!canManageGiveaway(interaction, cfg) && !["list"].includes(sub)) {
    return interaction.reply({ content: "❌ You need Manage Server or the giveaway manager role.", flags: 64 });
  }

  await interaction.deferReply({ flags: 64 });

  try {
    if (sub === "start")     return await startGiveaway(interaction, cfg);
    if (sub === "end")       return await endGiveawayCmd(interaction);
    if (sub === "reroll")    return await rerollGiveaway(interaction);
    if (sub === "cancel")    return await cancelGiveaway(interaction);
    if (sub === "pause")     return await pauseGiveaway(interaction);
    if (sub === "resume")    return await resumeGiveaway(interaction);
    if (sub === "duplicate") return await duplicateGiveaway(interaction, cfg);
    if (sub === "list")      return await listGiveaways(interaction);
    if (sub === "analytics") return await analyticsGiveaway(interaction);
    if (sub === "settings")  return await settingsGiveaway(interaction, cfg);
  } catch (err) {
    console.error("[GIVEAWAY CMD]", err);
    return interaction.editReply({ content: `❌ Error: ${err.message}` });
  }
}

async function startGiveaway(interaction, cfg) {
  const prize      = interaction.options.getString("prize");
  const durStr     = interaction.options.getString("duration");
  const winners    = interaction.options.getInteger("winners") || 1;
  const desc       = interaction.options.getString("description") || "";
  const channel    = interaction.options.getChannel("channel") || interaction.channel;
  const reqRole    = interaction.options.getRole("required_role");
  const minDays    = interaction.options.getInteger("min_account_days") || 0;
  const nitroOnly  = interaction.options.getBoolean("nitro_only") || false;
  const multiplier = interaction.options.getString("multiplier");
  const durMs      = parseDuration(durStr);

  if (!durMs) return interaction.editReply({ content: "❌ Invalid duration. Use e.g. `30m`, `1h`, `2d`" });

  const endsAt     = Date.now() + durMs;
  const giveawayId = uuidv4().split("-")[0].toUpperCase();

  const gw = await Giveaway.create({
    giveawayId,
    guildId:     interaction.guild.id,
    channelId:   channel.id,
    prize, description: desc,
    hostedBy:    interaction.user.id,
    winnerCount: winners,
    endsAt,
    requiredRoles:    reqRole ? [reqRole.id] : [],
    minAccountDays:   minDays,
    nitroBoosterOnly: nitroOnly,
    roleMultipliers:  multiplier ? [multiplier] : [],
  });

  const msg = await channel.send(buildGiveawayPayload(gw));
  gw.messageId = msg.id;
  await gw.save();

  scheduleGiveaway(gw, interaction.guild);

  return interaction.editReply({ content: `✅ Giveaway started in ${channel}! Ends <t:${Math.floor(endsAt / 1000)}:R>\n**ID:** \`${giveawayId}\`` });
}

async function endGiveawayCmd(interaction) {
  const id = interaction.options.getString("id").toUpperCase();
  const gw = await Giveaway.findOne({ giveawayId: id, guildId: interaction.guild.id });
  if (!gw || gw.ended) return interaction.editReply({ content: "❌ Giveaway not found or already ended." });
  await endGiveaway(id, interaction.guild);
  return interaction.editReply({ content: `✅ Giveaway \`${id}\` ended.` });
}

async function rerollGiveaway(interaction) {
  const id    = interaction.options.getString("id").toUpperCase();
  const count = interaction.options.getInteger("count") || 1;
  const gw    = await Giveaway.findOne({ giveawayId: id, guildId: interaction.guild.id });
  if (!gw || !gw.ended) return interaction.editReply({ content: "❌ Giveaway not found or not ended yet." });

  const newWinners = pickWinners(gw.participants, count);
  gw.winners = newWinners;
  await gw.save();

  const channel = interaction.guild.channels.cache.get(gw.channelId);
  if (channel && newWinners.length) {
    await channel.send({
      content: newWinners.map(id => `<@${id}>`).join(" "),
      embeds: [
        new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle("🎉 Giveaway Reroll!")
          .setDescription(`New winners: ${newWinners.map(id => `<@${id}>`).join(", ")} won **${gw.prize}**!`)
          .setTimestamp(),
      ],
      allowedMentions: { users: newWinners },
    });
  }

  return interaction.editReply({ content: `✅ Rerolled \`${id}\`. New winners: ${newWinners.map(id => `<@${id}>`).join(", ")}` });
}

async function cancelGiveaway(interaction) {
  const id = interaction.options.getString("id").toUpperCase();
  const gw = await Giveaway.findOne({ giveawayId: id, guildId: interaction.guild.id });
  if (!gw) return interaction.editReply({ content: "❌ Giveaway not found." });

  if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); }

  try {
    const channel = interaction.guild.channels.cache.get(gw.channelId);
    const msg = await channel?.messages.fetch(gw.messageId).catch(() => null);
    await msg?.delete();
  } catch {}

  await Giveaway.deleteOne({ giveawayId: id });
  return interaction.editReply({ content: `✅ Giveaway \`${id}\` cancelled and deleted.` });
}

async function pauseGiveaway(interaction) {
  const id = interaction.options.getString("id").toUpperCase();
  const gw = await Giveaway.findOne({ giveawayId: id, guildId: interaction.guild.id, ended: false });
  if (!gw) return interaction.editReply({ content: "❌ Active giveaway not found." });
  if (gw.paused) return interaction.editReply({ content: "⚠️ Already paused." });

  gw.paused      = true;
  gw.pausedAt    = Date.now();
  gw.remainingMs = Math.max(0, gw.endsAt - Date.now());
  await gw.save();

  if (timers.has(id)) { clearTimeout(timers.get(id)); timers.delete(id); }

  try {
    const ch  = interaction.guild.channels.cache.get(gw.channelId);
    const msg = await ch?.messages.fetch(gw.messageId).catch(() => null);
    await msg?.edit(buildGiveawayPayload(gw));
  } catch {}

  return interaction.editReply({ content: `✅ Giveaway \`${id}\` paused. Remaining: **${formatMs(gw.remainingMs)}**` });
}

async function resumeGiveaway(interaction) {
  const id = interaction.options.getString("id").toUpperCase();
  const gw = await Giveaway.findOne({ giveawayId: id, guildId: interaction.guild.id, ended: false });
  if (!gw || !gw.paused) return interaction.editReply({ content: "❌ Paused giveaway not found." });

  gw.endsAt  = Date.now() + (gw.remainingMs || 0);
  gw.paused  = false;
  gw.pausedAt = null;
  await gw.save();

  scheduleGiveaway(gw, interaction.guild);

  try {
    const ch  = interaction.guild.channels.cache.get(gw.channelId);
    const msg = await ch?.messages.fetch(gw.messageId).catch(() => null);
    await msg?.edit(buildGiveawayPayload(gw));
  } catch {}

  return interaction.editReply({ content: `✅ Giveaway \`${id}\` resumed. Ends <t:${Math.floor(gw.endsAt/1000)}:R>` });
}

async function duplicateGiveaway(interaction, cfg) {
  const id     = interaction.options.getString("id").toUpperCase();
  const durStr = interaction.options.getString("duration");
  const durMs  = parseDuration(durStr);
  if (!durMs) return interaction.editReply({ content: "❌ Invalid duration." });

  const orig = await Giveaway.findOne({ giveawayId: id, guildId: interaction.guild.id });
  if (!orig) return interaction.editReply({ content: "❌ Giveaway not found." });

  const newId  = uuidv4().split("-")[0].toUpperCase();
  const endsAt = Date.now() + durMs;

  const gw = await Giveaway.create({
    giveawayId:      newId,
    guildId:         orig.guildId,
    channelId:       orig.channelId,
    prize:           orig.prize,
    description:     orig.description,
    hostedBy:        interaction.user.id,
    winnerCount:     orig.winnerCount,
    endsAt,
    requiredRoles:    orig.requiredRoles,
    minAccountDays:   orig.minAccountDays,
    nitroBoosterOnly: orig.nitroBoosterOnly,
    roleMultipliers:  orig.roleMultipliers,
  });

  const channel = interaction.guild.channels.cache.get(gw.channelId);
  if (channel) {
    const msg = await channel.send(buildGiveawayPayload(gw));
    gw.messageId = msg.id;
    await gw.save();
    scheduleGiveaway(gw, interaction.guild);
  }

  return interaction.editReply({ content: `✅ Giveaway duplicated. New ID: \`${newId}\` — Ends <t:${Math.floor(endsAt/1000)}:R>` });
}

async function listGiveaways(interaction) {
  const active = await Giveaway.find({ guildId: interaction.guild.id, ended: false }).sort({ endsAt: 1 }).limit(10);
  if (!active.length) return interaction.editReply({ content: "No active giveaways." });

  const lines = active.map(gw =>
    `\`${gw.giveawayId}\` **${gw.prize}** — ${gw.participants.length} entries — ends <t:${Math.floor(gw.endsAt/1000)}:R>${gw.paused ? " ⏸️" : ""}`
  ).join("\n");

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🎉 Active Giveaways (${active.length})`)
        .setDescription(lines)
        .setTimestamp(),
    ],
  });
}

async function analyticsGiveaway(interaction) {
  const id = interaction.options.getString("id").toUpperCase();
  const gw = await Giveaway.findOne({ giveawayId: id, guildId: interaction.guild.id });
  if (!gw) return interaction.editReply({ content: "❌ Giveaway not found." });

  const unique = [...new Set(gw.participants)].length;
  const multi  = gw.participants.length - unique;

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle(`📊 Giveaway Analytics — ${gw.prize}`)
        .addFields(
          { name: "Total Entries",    value: `${gw.participants.length}`, inline: true },
          { name: "Unique Entrants",  value: `${unique}`,                  inline: true },
          { name: "Multiplier Bonus", value: `+${multi}`,                  inline: true },
          { name: "Winners",          value: `${gw.winnerCount}`,          inline: true },
          { name: "Status",           value: gw.ended ? "Ended" : gw.paused ? "Paused" : "Active", inline: true },
          { name: "Ends",             value: `<t:${Math.floor(gw.endsAt/1000)}:F>`, inline: true },
          { name: "ID",               value: `\`${gw.giveawayId}\``,       inline: true },
        )
        .setTimestamp(),
    ],
  });
}

async function settingsGiveaway(interaction, cfg) {
  const logCh   = interaction.options.getChannel("log_channel");
  const mgrRole = interaction.options.getRole("manager_role");
  const updates = {};
  if (logCh)   updates.giveawayLogChannelId    = logCh.id;
  if (mgrRole) updates.giveawayManagerRoleId   = mgrRole.id;
  if (!Object.keys(updates).length) return interaction.editReply({ content: "⚠️ Provide at least one option." });
  await updateGuildConfig(interaction.guild.id, updates);
  return interaction.editReply({ content: "✅ Giveaway settings updated." });
}

// ── Autocomplete ──────────────────────────────────────────────────────────────
async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toUpperCase();
  const sub     = interaction.options.getSubcommand();
  const filter  = sub === "reroll" || sub === "duplicate" || sub === "analytics"
    ? {} : { ended: false };

  const giveaways = await Giveaway.find({ guildId: interaction.guild.id, ...filter }).limit(25);
  await interaction.respond(
    giveaways
      .filter(g => g.giveawayId.includes(focused))
      .map(g => ({ name: `${g.giveawayId} — ${g.prize}`, value: g.giveawayId }))
  );
}

module.exports = { data, execute, autocomplete, restoreGiveaways, handleGiveawayButton, scheduleGiveaway };

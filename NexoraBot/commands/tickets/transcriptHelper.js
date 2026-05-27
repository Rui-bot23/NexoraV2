const { EmbedBuilder, AttachmentBuilder } = require("discord.js");

async function postTranscript(channel, ticket, guild, guildCfg) {
  try {
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted   = [...messages.values()].reverse();
    const lines    = sorted.map(m =>
      `[${new Date(m.createdTimestamp).toISOString()}] ${m.author.tag}: ${m.content || "(embed/attachment)"}`
    ).join("\n");

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

module.exports = { postTranscript };

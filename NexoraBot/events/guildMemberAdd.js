/**
 * guildMemberAdd — Components V2 welcome message
 * Matches the Kalash System style: banner + title + info + buttons
 */
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder,
  MediaGalleryBuilder, MediaGalleryItemBuilder, UnfurledMediaItemBuilder,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require("discord.js");
const { getGuildConfig } = require("../utils/guildConfig");

const once = false;

async function execute(member, client) {
  try {
    const cfg = await getGuildConfig(member.guild.id);
    if (!cfg.welcomeChannelId) return;

    const channel = member.guild.channels.cache.get(cfg.welcomeChannelId);
    if (!channel) return;

    const created = Math.floor(member.user.createdTimestamp / 1000);

    const container = new ContainerBuilder();

    if (cfg.welcomeBannerUrl) {
      container.addMediaGalleryComponents(
        new MediaGalleryBuilder().addItems(
          new MediaGalleryItemBuilder()
            .setMedia(new UnfurledMediaItemBuilder().setURL(cfg.welcomeBannerUrl))
        )
      );
    }

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${cfg.welcomeTitle || "Welcome to Nexora"}`
      )
    );

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        (cfg.welcomeDescription || "Hey {user}, welcome to **Nexora**!")
          .replace("{user}", `<@${member.id}>`)
          .replace("{username}", member.user.username)
          .replace("{server}", member.guild.name)
      )
    );

    container.addSeparatorComponents(new SeparatorBuilder());

    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          `- **Information** ℹ️`,
          `  - User-ID: \`${member.user.id}\``,
          `  - Account Created: <t:${created}:R>`,
        ].join("\n")
      )
    );

    const rows = [];

    // Verify + Ticket buttons
    const hasVerify = cfg.welcomeVerifyUrl || cfg.welcomeVerifyChannelId;
    const hasTicket = cfg.welcomeTicketUrl || cfg.welcomeTicketChannelId;

    if (hasVerify || hasTicket) {
      const row = new ActionRowBuilder();

      if (hasVerify) {
        const btn = new ButtonBuilder()
          .setLabel(cfg.welcomeVerifyLabel || "Verify")
          .setStyle(ButtonStyle.Link)
          .setEmoji("🛡️");
        if (cfg.welcomeVerifyUrl) btn.setURL(cfg.welcomeVerifyUrl);
        else btn.setURL(`https://discord.com/channels/${member.guild.id}/${cfg.welcomeVerifyChannelId}`);
        row.addComponents(btn);
      }

      if (hasTicket) {
        const btn = new ButtonBuilder()
          .setLabel(cfg.welcomeTicketLabel || "Ticket System")
          .setStyle(ButtonStyle.Link)
          .setEmoji("🎫");
        if (cfg.welcomeTicketUrl) btn.setURL(cfg.welcomeTicketUrl);
        else btn.setURL(`https://discord.com/channels/${member.guild.id}/${cfg.welcomeTicketChannelId}`);
        row.addComponents(btn);
      }

      rows.push(row);
    }

    await channel.send({
      components: [container, ...rows],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { users: [member.id] },
    });

  } catch (err) {
    console.error("[WELCOME]", err.message);
  }
}

module.exports = { once, execute };

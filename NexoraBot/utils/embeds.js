const { EmbedBuilder } = require("discord.js");

function hex(colorStr) {
  if (!colorStr) return 0x5865F2;
  return parseInt(colorStr.replace("#", ""), 16);
}

/**
 * Build a base embed using guild config (from DB) or fallback defaults.
 * @param {number} color
 * @param {object|null} guildCfg  — GuildConfig document or null
 */
function baseEmbed(color, guildCfg = null) {
  const footer = guildCfg?.brandFooter || "Nexora";
  const icon   = guildCfg?.brandIcon   || null;
  return new EmbedBuilder()
    .setColor(color)
    .setFooter({ text: footer, iconURL: icon || undefined })
    .setTimestamp();
}

function successEmbed(title, description, guildCfg = null) {
  return baseEmbed(hex(guildCfg?.brandColor ? null : "57F287"), guildCfg)
    .setColor(0x57F287)
    .setTitle(`✅  ${title}`)
    .setDescription(description);
}

function errorEmbed(title, description, guildCfg = null) {
  return baseEmbed(0xED4245, guildCfg)
    .setTitle(`❌  ${title}`)
    .setDescription(description);
}

function warningEmbed(title, description, guildCfg = null) {
  return baseEmbed(0xFEE75C, guildCfg)
    .setTitle(`⚠️  ${title}`)
    .setDescription(description);
}

function infoEmbed(title, description, guildCfg = null) {
  const c = guildCfg?.brandColor ? hex(guildCfg.brandColor) : 0x5865F2;
  return baseEmbed(c, guildCfg)
    .setTitle(`ℹ️  ${title}`)
    .setDescription(description);
}

function licenseEmbed(title, description, guildCfg = null) {
  return baseEmbed(0x9B59B6, guildCfg)
    .setTitle(`🔑  ${title}`)
    .setDescription(description);
}

function brandEmbed(title, description, guildCfg = null) {
  const c = guildCfg?.brandColor ? hex(guildCfg.brandColor) : 0x5865F2;
  return baseEmbed(c, guildCfg)
    .setTitle(title)
    .setDescription(description);
}

module.exports = { successEmbed, errorEmbed, warningEmbed, infoEmbed, licenseEmbed, brandEmbed, baseEmbed, hex };

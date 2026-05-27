/**
 * utils/guildConfig.js
 * Fetch (or auto-create) a guild's config from MongoDB.
 * All bot settings are stored here — no config.yml needed for per-guild stuff.
 */

const { GuildConfig } = require("../models");

/**
 * Get config for a guild, creating a default if it doesn't exist.
 * @param {string} guildId
 * @returns {Promise<GuildConfig>}
 */
async function getGuildConfig(guildId) {
  let cfg = await GuildConfig.findOne({ guildId });
  if (!cfg) {
    cfg = await GuildConfig.create({ guildId });
  }
  return cfg;
}

/**
 * Update specific fields for a guild config.
 * @param {string} guildId
 * @param {object} updates
 */
async function updateGuildConfig(guildId, updates) {
  return GuildConfig.findOneAndUpdate(
    { guildId },
    { $set: updates },
    { upsert: true, new: true }
  );
}

/**
 * Check if a member is staff (admin or has a support role from guild config).
 */
function isStaffMember(member, guildCfg) {
  if (!member) return false;
  const { PermissionsBitField } = require("discord.js");
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  if (!guildCfg?.ticketSupportRoleIds?.length) return false;
  return member.roles.cache.some(r => guildCfg.ticketSupportRoleIds.includes(r.id));
}

module.exports = { getGuildConfig, updateGuildConfig, isStaffMember };

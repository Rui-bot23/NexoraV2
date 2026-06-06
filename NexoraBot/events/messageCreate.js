/**
 * events/messageCreate.js
 * Handles DMs for Nexora account holders:
 *   !license  — view your license info
 *   !reset    — request a reset (submits to admin)
 *   !download — get download link for your product
 *   !account  — view account info
 *   !help     — list commands
 */

const { EmbedBuilder } = require("discord.js");
const { License, Account } = require("../models");

const once = false;

async function execute(message, client) {
  // Only handle DMs, no bots
  if (message.author.bot) return;
  if (message.guild) return; // only DMs

  const content = message.content.trim().toLowerCase();
  if (!content.startsWith("!")) return;

  const cmd = content.split(/\s+/)[0];

  try {
    if (cmd === "!help")     return await handleHelp(message);
    if (cmd === "!license")  return await handleLicense(message);
    if (cmd === "!account")  return await handleAccount(message);
    if (cmd === "!reset")    return await handleReset(message, client);
    if (cmd === "!download") return await handleDownload(message);
  } catch (err) {
    console.error("[DM HANDLER]", err.message);
    message.reply("❌ An error occurred. Please try again or contact support.").catch(() => {});
  }
}

// ── !help ─────────────────────────────────────────────────────────────────────
async function handleHelp(message) {
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle("📋 Nexora DM Commands")
        .setDescription("Manage your Nexora account and licenses directly via DM.")
        .addFields(
          { name: "!license",  value: "View your license status and details",           inline: false },
          { name: "!account",  value: "View your account info (email, product, etc.)",  inline: false },
          { name: "!reset",    value: "Request a reset of your IP/HWID bindings",       inline: false },
          { name: "!download", value: "Get your product download link",                 inline: false },
          { name: "!help",     value: "Show this help message",                         inline: false },
        )
        .setFooter({ text: "Nexora • Need help? Open a support ticket on the server." })
        .setTimestamp(),
    ],
  });
}

// ── !license ──────────────────────────────────────────────────────────────────
async function handleLicense(message) {
  const account = await Account.findOne({ discordId: message.author.id });

  if (!account) {
    return message.reply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle("❌ No Account Found")
          .setDescription("You don't have a Nexora account yet.\nUse `/account create` on the server to get started.")
          .setTimestamp(),
      ],
    });
  }

  const license = await License.findOne({ licenseKey: account.licenseKey });
  if (!license) {
    return message.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle("❌ License Not Found").setDescription("Your linked license could not be found. Contact support.").setTimestamp()] });
  }

  const statusEmoji = license.suspended ? "🔴" : !license.isUsed ? "🟡" : "🟢";
  const statusText  = license.suspended ? "Suspended" : !license.isUsed ? "Unused" : "Active";
  const expiryText  = license.permanent || license.expiresAt === 0
    ? "♾️ Lifetime"
    : license.expiresAt < Date.now()
      ? "⛔ Expired"
      : `<t:${Math.floor(license.expiresAt / 1000)}:F>`;

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(license.suspended ? 0xED4245 : 0x9B59B6)
        .setTitle("🔑 Your License")
        .addFields(
          { name: "🔑 Key",         value: `\`${license.licenseKey}\``,                          inline: false },
          { name: "📦 Product",     value: license.productName,                                  inline: true  },
          { name: "🏷️ Status",     value: `${statusEmoji} ${statusText}`,                       inline: true  },
          { name: "⏳ Expires",     value: expiryText,                                            inline: true  },
          { name: "🌐 IPs Bound",   value: `${license.ipArray?.length || 0} / ${license.maxIp}`, inline: true  },
          { name: "📊 Requests",    value: `${license.totalRequests || 0}`,                       inline: true  },
        )
        .setFooter({ text: "Type !reset to request a binding reset" })
        .setTimestamp(),
    ],
  });
}

// ── !account ──────────────────────────────────────────────────────────────────
async function handleAccount(message) {
  const account = await Account.findOne({ discordId: message.author.id });

  if (!account) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor(0xED4245).setTitle("❌ No Account").setDescription("Use `/account create` on the server to create your account.").setTimestamp()],
    });
  }

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle("👤 Your Account")
        .addFields(
          { name: "📧 Email",   value: `\`${account.email}\``,    inline: true },
          { name: "📦 Product", value: account.productName,       inline: true },
          { name: "🔑 License", value: `\`${account.licenseKey}\``, inline: true },
          { name: "📅 Created", value: `<t:${Math.floor(account.createdAt / 1000)}:F>`, inline: true },
        )
        .setFooter({ text: "Nexora Account" })
        .setTimestamp(),
    ],
  });
}

// ── !reset ────────────────────────────────────────────────────────────────────
async function handleReset(message, client) {
  const account = await Account.findOne({ discordId: message.author.id });
  if (!account) {
    return message.reply("❌ No account found. Use `/account create` on the server first.");
  }

  const license = await License.findOne({ licenseKey: account.licenseKey });
  if (!license) return message.reply("❌ License not found. Contact support.");

  // Auto-reset for active licenses
  license.ipArray   = [];
  license.hwidArray = [];
  license.latestIp  = null;
  await license.save();

  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle("✅ Bindings Reset")
        .setDescription(`Your IP and HWID bindings for **${license.productName}** have been reset.\nYou can now use your license on a new device/IP.`)
        .setTimestamp(),
    ],
  });
}

// ── !download ─────────────────────────────────────────────────────────────────
async function handleDownload(message) {
  const account = await Account.findOne({ discordId: message.author.id });
  if (!account) {
    return message.reply("❌ No account found. Use `/account create` on the server first.");
  }

  const license = await License.findOne({ licenseKey: account.licenseKey });
  if (!license || license.suspended) {
    return message.reply("❌ Your license is invalid or suspended. Contact support.");
  }
  if (!license.permanent && license.expiresAt > 0 && license.expiresAt < Date.now()) {
    return message.reply("❌ Your license has expired. Renew it to access downloads.");
  }

  // Download link stub — replace with real URL/logic later
  await message.reply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle("📥 Download — " + license.productName)
        .setDescription(
          "🚧 **Download system coming soon!**\n\nYour license is valid and your download will be available here once the download server is configured.\n\nContact support on the Discord server for manual download access in the meantime."
        )
        .addFields(
          { name: "📦 Product", value: license.productName, inline: true },
          { name: "🏷️ Status",  value: "🟢 Valid",           inline: true },
        )
        .setFooter({ text: "Nexora • Download System" })
        .setTimestamp(),
    ],
  });
}

module.exports = { once, execute };

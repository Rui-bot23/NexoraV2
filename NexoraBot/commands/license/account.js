/**
 * /account — Create a Nexora account by redeeming a valid license
 * Links Discord ID + email + password to a license
 * Bot DMs the user with confirmation + download access
 */

const {
  SlashCommandBuilder,
  EmbedBuilder,
} = require("discord.js");
const bcrypt = require("bcryptjs");
const { License, Account } = require("../../models");
const { getGuildConfig } = require("../../utils/guildConfig");
const { successEmbed, errorEmbed } = require("../../utils/embeds");

const data = new SlashCommandBuilder()
  .setName("account")
  .setDescription("Manage your Nexora account")

  .addSubcommand(s => s.setName("create")
    .setDescription("Create your Nexora account by redeeming a license")
    .addStringOption(o => o.setName("key").setDescription("Your license key").setRequired(true))
    .addStringOption(o => o.setName("email").setDescription("Your email address").setRequired(true))
    .addStringOption(o => o.setName("password").setDescription("Your account password").setRequired(true))
  )

  .addSubcommand(s => s.setName("info")
    .setDescription("View your account info")
  )

  .addSubcommand(s => s.setName("delete")
    .setDescription("Delete your Nexora account")
  );

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "create") return await createAccount(interaction);
  if (sub === "info")   return await accountInfo(interaction);
  if (sub === "delete") return await deleteAccount(interaction);
}

async function createAccount(interaction) {
  await interaction.deferReply({ flags: 64 });

  const key      = interaction.options.getString("key").trim().toUpperCase();
  const email    = interaction.options.getString("email").trim().toLowerCase();
  const password = interaction.options.getString("password");
  const cfg      = await getGuildConfig(interaction.guild?.id);

  // Validate email format
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return interaction.editReply({ embeds: [errorEmbed("Invalid Email", "Please provide a valid email address.")] });
  }

  // Password strength
  if (password.length < 8) {
    return interaction.editReply({ embeds: [errorEmbed("Weak Password", "Password must be at least 8 characters.")] });
  }

  // Check existing account
  const existing = await Account.findOne({ discordId: interaction.user.id });
  if (existing) {
    return interaction.editReply({ embeds: [errorEmbed("Account Exists", `You already have an account linked to \`${existing.licenseKey}\`. Use \`/account info\` to view it.`)] });
  }

  // Check email taken
  const emailTaken = await Account.findOne({ email });
  if (emailTaken) {
    return interaction.editReply({ embeds: [errorEmbed("Email Taken", "This email is already linked to another account.")] });
  }

  // Validate license
  const license = await License.findOne({ licenseKey: key });
  if (!license) {
    return interaction.editReply({ embeds: [errorEmbed("Invalid Key", `No license found for \`${key}\`.`)] });
  }
  if (license.suspended) {
    return interaction.editReply({ embeds: [errorEmbed("Suspended", "This license has been suspended.")] });
  }
  if (!license.permanent && license.expiresAt > 0 && license.expiresAt < Date.now()) {
    return interaction.editReply({ embeds: [errorEmbed("Expired", "This license has expired.")] });
  }

  // Check testMode
  const testMode = cfg?.redeemTestMode === true;
  if (!testMode && !license.redeemEnabled) {
    return interaction.editReply({ embeds: [errorEmbed("Not Available", "This license is not enabled for account creation. Contact an admin.")] });
  }

  // Hash password
  const passwordHash = await bcrypt.hash(password, 12);

  // Create account
  const account = await Account.create({
    discordId:    interaction.user.id,
    discordTag:   interaction.user.tag,
    email,
    passwordHash,
    licenseKey:   key,
    productName:  license.productName,
  });

  // Mark license as redeemed
  if (!license.redeemedBy) {
    license.redeemedBy = interaction.user.id;
    license.redeemedAt = Date.now();
    await license.save();
  }

  // Send DM with account details
  let dmSent = false;
  try {
    const expiryText = license.permanent || license.expiresAt === 0
      ? "♾️ Lifetime"
      : `<t:${Math.floor(license.expiresAt / 1000)}:F>`;

    const dmEmbed = new EmbedBuilder()
      .setColor(0x9B59B6)
      .setTitle("🎉 Account Created — Nexora")
      .setDescription("Your Nexora account has been successfully created! Here are your credentials:")
      .addFields(
        { name: "📧 Email",       value: `\`${email}\``,     inline: true  },
        { name: "🔑 License",     value: `\`${key}\``,        inline: true  },
        { name: "📦 Product",     value: license.productName, inline: true  },
        { name: "⏳ Valid until", value: expiryText,          inline: true  },
        { name: "🔒 Password",    value: "Stored securely (hashed). Use your password to log in.", inline: false },
        { name: "📥 Download",    value: "Type `!download` here in DMs to get your download link.", inline: false },
      )
      .setFooter({ text: "Keep your credentials safe! Nexora" })
      .setTimestamp();

    // Send welcome DM with full details + commands
    const commandsEmbed = new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle("📋 Your DM Commands")
      .setDescription("You can manage your license and account by DMing me directly:")
      .addFields(
        { name: "!license",  value: "View your license status, IPs and requests", inline: false },
        { name: "!account",  value: "View your account info",                      inline: false },
        { name: "!reset",    value: "Reset your IP/HWID bindings instantly",       inline: false },
        { name: "!download", value: "Get your product download link",              inline: false },
        { name: "!help",     value: "Show all available commands",                 inline: false },
      )
      .setFooter({ text: "Nexora • Reply to this DM anytime" });

    await interaction.user.send({ embeds: [dmEmbed, commandsEmbed] });
    dmSent = true;
  } catch {
    dmSent = false;
  }

  return interaction.editReply({
    embeds: [
      successEmbed(
        "✅ Account Created",
        `Your Nexora account has been created!\n\n` +
        `📧 **Email:** \`${email}\`\n` +
        `📦 **Product:** ${license.productName}\n\n` +
        (dmSent
          ? "✉️ **Check your DMs** — we sent your account details and a list of bot commands!"
          : "⚠️ We couldn't send you a DM. Please **enable DMs** from server members and use \`!help\` in my DMs."
        )
      ),
    ],
  });
}

async function accountInfo(interaction) {
  await interaction.deferReply({ flags: 64 });

  const account = await Account.findOne({ discordId: interaction.user.id });
  if (!account) {
    return interaction.editReply({ embeds: [errorEmbed("No Account", "You don't have a Nexora account. Use `/account create` to get started.")] });
  }

  const license = await License.findOne({ licenseKey: account.licenseKey });

  return interaction.editReply({
    embeds: [
      new EmbedBuilder()
        .setColor(0x9B59B6)
        .setTitle("👤 Your Nexora Account")
        .addFields(
          { name: "📧 Email",     value: `\`${account.email}\``,                 inline: true },
          { name: "📦 Product",   value: account.productName,                    inline: true },
          { name: "🔑 License",   value: `\`${account.licenseKey}\``,            inline: true },
          { name: "🏷️ Status",   value: license ? (license.suspended ? "🔴 Suspended" : "🟢 Active") : "❓ Unknown", inline: true },
          { name: "📅 Created",   value: `<t:${Math.floor(account.createdAt / 1000)}:F>`, inline: true },
        )
        .setFooter({ text: "Nexora Account Management" })
        .setTimestamp(),
    ],
  });
}

async function deleteAccount(interaction) {
  await interaction.deferReply({ flags: 64 });

  const account = await Account.findOneAndDelete({ discordId: interaction.user.id });
  if (!account) {
    return interaction.editReply({ embeds: [errorEmbed("No Account", "You don't have a Nexora account.")] });
  }

  return interaction.editReply({ embeds: [successEmbed("Account Deleted", "Your Nexora account has been deleted.")] });
}

module.exports = { data, execute };

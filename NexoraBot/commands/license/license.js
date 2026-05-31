/**
 * /redeem — Redeem a Nexora license key
 * /pricing — Show Nexora pricing
 * All responses use Components V2
 */

const {
  SlashCommandBuilder,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  MessageFlags,
} = require("discord.js");
const { License } = require("../../models");
const { getGuildConfig } = require("../../utils/guildConfig");

function cv2(color, ...textBlocks) {
  const c = new ContainerBuilder().setAccentColor(color);
  for (let i = 0; i < textBlocks.length; i++) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(textBlocks[i]));
    if (i < textBlocks.length - 1) c.addSeparatorComponents(new SeparatorBuilder());
  }
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

// ── /redeem ───────────────────────────────────────────────────────────────────
const redeemData = new SlashCommandBuilder()
  .setName("redeem")
  .setDescription("Redeem a Nexora license key")
  .addStringOption(o =>
    o.setName("key").setDescription("Your license key (NEXORA-XXXX-XXXX-XXXX-XXXX)").setRequired(true)
  );

async function executeRedeem(interaction) {
  await interaction.deferReply({ flags: 64 });

  const key     = interaction.options.getString("key").trim().toUpperCase();
  const guildId = interaction.guild?.id;
  const cfg     = guildId ? await getGuildConfig(guildId) : null;
  const license = await License.findOne({ licenseKey: key });

  // ── Not found ──────────────────────────────────────────────────────────────
  if (!license) {
    return interaction.editReply(
      cv2(0xED4245,
        "# ❌ Invalid Key",
        `No license found for key \`${key}\`.\nDouble-check the key and try again.`
      )
    );
  }

  // ── Already redeemed ───────────────────────────────────────────────────────
  if (license.redeemedBy) {
    const isYou = license.redeemedBy === interaction.user.id;
    return interaction.editReply(
      cv2(0xFEE75C,
        "# ⚠️ Already Redeemed",
        isYou
          ? `You already redeemed this key <t:${Math.floor(license.redeemedAt / 1000)}:R>.`
          : "This key has already been redeemed by someone else."
      )
    );
  }

  // ── Redeem not enabled ─────────────────────────────────────────────────────
  const testMode = cfg?.redeemTestMode === true;
  if (!testMode && !license.redeemEnabled) {
    return interaction.editReply(
      cv2(0xED4245,
        "# ❌ Not Available",
        "This key is not available for redeem right now.\nContact an admin or open a ticket."
      )
    );
  }

  // ── Suspended ─────────────────────────────────────────────────────────────
  if (license.suspended) {
    return interaction.editReply(
      cv2(0xED4245,
        "# ❌ Suspended",
        "This license has been suspended and cannot be redeemed."
      )
    );
  }

  // ── Expired ───────────────────────────────────────────────────────────────
  if (!license.permanent && license.expiresAt > 0 && license.expiresAt < Date.now()) {
    return interaction.editReply(
      cv2(0xED4245,
        "# ❌ Expired",
        "This license has expired and can no longer be redeemed."
      )
    );
  }

  // ── Mark as redeemed ───────────────────────────────────────────────────────
  license.redeemedBy = interaction.user.id;
  license.redeemedAt = Date.now();
  if (!license.isUsed) { license.isUsed = true; license.usedAt = Date.now(); }
  await license.save();

  const expiryText = license.permanent || license.expiresAt === 0
    ? "♾️ Lifetime"
    : `<t:${Math.floor(license.expiresAt / 1000)}:F>`;

  return interaction.editReply(
    cv2(0x57F287,
      "# ✅ License Redeemed!",
      [
        `Your license for **${license.productName}** has been successfully redeemed.`,
        ``,
        `🔑 **Key:** \`${license.licenseKey}\``,
        `📦 **Product:** ${license.productName}`,
        `⏳ **Expires:** ${expiryText}`,
        license.description ? `📝 **Note:** ${license.description}` : null,
      ].filter(Boolean).join("\n"),
      `-# Redeemed by ${interaction.user.tag} • Nexora`
    )
  );
}

// ── /pricing ──────────────────────────────────────────────────────────────────
const pricingData = new SlashCommandBuilder()
  .setName("pricing")
  .setDescription("View Nexora pricing plans");

async function executePricing(interaction) {
  await interaction.deferReply({ flags: 64 });

  const container = new ContainerBuilder()
    .setAccentColor(0x9B59B6)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent("# 💎 Nexora — Pricing")
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### 📅 Monthly — **€7.99 / month**",
          "> ✅ Full access to all features",
          "> ✅ Regular updates",
          "> ✅ Priority support",
          "> ✅ Cancel anytime",
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        [
          "### ♾️ Lifetime — **€15.00 one-time**",
          "> ✅ Full access forever",
          "> ✅ All future updates included",
          "> ✅ Priority support",
          "> ✅ Best value — pay once, use forever",
        ].join("\n")
      )
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "-# To purchase, contact our team or open a ticket.\n-# Nexora Premium Licensing"
      )
    );

  return interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2,
  });
}

module.exports = {
  data:    redeemData,
  execute: executeRedeem,
  pricing: { data: pricingData, execute: executePricing },
};

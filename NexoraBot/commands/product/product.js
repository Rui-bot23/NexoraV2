/**
 * /product — Nexora Product Management
 * Subcommands: create | info | list | delete | edit
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const { v4: uuidv4 } = require("uuid");
const { Product, License } = require("../../models");
const { getConfig } = require("../../utils/config");
const { successEmbed, errorEmbed, infoEmbed, licenseEmbed } = require("../../utils/embeds");

function isDevOrAdmin(interaction) {
  const cfg = getConfig();
  if (interaction.user.id === cfg.developer?.id) return true;
  return interaction.memberPermissions?.has(PermissionFlagsBits.Administrator);
}

const data = new SlashCommandBuilder()
  .setName("product")
  .setDescription("Manage Nexora products")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)

  .addSubcommand(sub =>
    sub.setName("create")
      .setDescription("Register a new product")
      .addStringOption(o => o.setName("name").setDescription("Product name").setRequired(true))
      .addStringOption(o => o.setName("description").setDescription("Product description").setRequired(true))
      .addStringOption(o => o.setName("version").setDescription("Version (e.g. 1.0.0)").setRequired(true))
      .addStringOption(o => o.setName("price").setDescription("Price (e.g. $9.99 or Free)"))
  )
  .addSubcommand(sub =>
    sub.setName("info")
      .setDescription("View a product's details")
      .addStringOption(o => o.setName("name").setDescription("Product name").setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(sub =>
    sub.setName("list")
      .setDescription("List all registered products")
  )
  .addSubcommand(sub =>
    sub.setName("delete")
      .setDescription("Delete a product (and all its licenses)")
      .addStringOption(o => o.setName("name").setDescription("Product name").setRequired(true).setAutocomplete(true))
  )
  .addSubcommand(sub =>
    sub.setName("edit")
      .setDescription("Edit a product's details")
      .addStringOption(o => o.setName("name").setDescription("Current product name").setRequired(true).setAutocomplete(true))
      .addStringOption(o => o.setName("new_name").setDescription("New product name"))
      .addStringOption(o => o.setName("description").setDescription("New description"))
      .addStringOption(o => o.setName("version").setDescription("New version"))
      .addStringOption(o => o.setName("price").setDescription("New price"))
  );

async function execute(interaction) {
  if (!isDevOrAdmin(interaction)) {
    return interaction.reply({ embeds: [errorEmbed("No Permission", "You need Administrator to manage products.")], ephemeral: true });
  }

  await interaction.deferReply();
  const sub = interaction.options.getSubcommand();

  try {
    if (sub === "create") return await handleCreate(interaction);
    if (sub === "info")   return await handleInfo(interaction);
    if (sub === "list")   return await handleList(interaction);
    if (sub === "delete") return await handleDelete(interaction);
    if (sub === "edit")   return await handleEdit(interaction);
  } catch (err) {
    console.error("[PRODUCT CMD]", err);
    return interaction.editReply({ embeds: [errorEmbed("Error", err.message)] });
  }
}

async function handleCreate(interaction) {
  const name    = interaction.options.getString("name");
  const desc    = interaction.options.getString("description");
  const version = interaction.options.getString("version");
  const price   = interaction.options.getString("price") || "Free";

  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = await Product.findOne({ productName: new RegExp(`^${safeName}$`, "i") });
  if (existing) {
    return interaction.editReply({ embeds: [errorEmbed("Already Exists", `A product named **${name}** already exists.`)] });
  }

  const product = await Product.create({
    productId:   uuidv4(),
    productName: name,
    description: desc,
    version,
    price,
    createdBy: interaction.user.id,
  });

  return interaction.editReply({
    embeds: [
      licenseEmbed("Product Created", `**${name}** has been registered.`)
        .addFields(
          { name: "📦 Name",        value: name,    inline: true },
          { name: "🏷️ Version",     value: version, inline: true },
          { name: "💰 Price",       value: price,   inline: true },
          { name: "📝 Description", value: desc,    inline: false },
          { name: "🆔 Product ID",  value: `\`${product.productId}\``, inline: false },
        ),
    ],
  });
}

async function handleInfo(interaction) {
  const name = interaction.options.getString("name");
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const product = await Product.findOne({ productName: new RegExp(`^${safeName}$`, "i") });
  if (!product) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `No product named **${name}** was found.`)] });
  }

  const licenseCount = await License.countDocuments({ productName: product.productName });
  const activeCount  = await License.countDocuments({ productName: product.productName, suspended: false, isUsed: true });

  return interaction.editReply({
    embeds: [
      licenseEmbed(`Product: ${product.productName}`, product.description)
        .addFields(
          { name: "🏷️ Version",        value: product.version,         inline: true },
          { name: "💰 Price",           value: product.price,           inline: true },
          { name: "🔑 Total Licenses",  value: `${licenseCount}`,       inline: true },
          { name: "✅ Active Licenses", value: `${activeCount}`,        inline: true },
          { name: "📅 Created",         value: product.createdAt,       inline: true },
          { name: "🆔 Product ID",      value: `\`${product.productId}\``, inline: false },
        ),
    ],
  });
}

async function handleList(interaction) {
  const products = await Product.find().sort({ createdAt: -1 });
  if (!products.length) {
    return interaction.editReply({ embeds: [infoEmbed("No Products", "No products have been registered yet.")] });
  }

  const lines = await Promise.all(products.map(async p => {
    const count = await License.countDocuments({ productName: p.productName });
    return `**${p.productName}** v${p.version} — ${p.price} — \`${count} licenses\``;
  }));

  return interaction.editReply({
    embeds: [infoEmbed(`Products (${products.length})`, lines.join("\n"))],
  });
}

async function handleDelete(interaction) {
  const name = interaction.options.getString("name");
  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const product = await Product.findOneAndDelete({ productName: new RegExp(`^${safeName}$`, "i") });
  if (!product) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `No product named **${name}** was found.`)] });
  }

  const deleted = await License.deleteMany({ productName: product.productName });

  return interaction.editReply({
    embeds: [
      successEmbed("Product Deleted", `**${product.productName}** and **${deleted.deletedCount}** associated license(s) have been deleted.`),
    ],
  });
}

async function handleEdit(interaction) {
  const name     = interaction.options.getString("name");
  const newName  = interaction.options.getString("new_name");
  const desc     = interaction.options.getString("description");
  const version  = interaction.options.getString("version");
  const price    = interaction.options.getString("price");

  const safeName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const product = await Product.findOne({ productName: new RegExp(`^${safeName}$`, "i") });
  if (!product) {
    return interaction.editReply({ embeds: [errorEmbed("Not Found", `No product named **${name}** was found.`)] });
  }

  if (newName)  product.productName = newName;
  if (desc)     product.description = desc;
  if (version)  product.version = version;
  if (price)    product.price = price;
  await product.save();

  return interaction.editReply({
    embeds: [successEmbed("Product Updated", `**${product.productName}** has been updated.`)],
  });
}

async function autocomplete(interaction) {
  const focused = interaction.options.getFocused().toLowerCase();
  const products = await Product.find().limit(25);
  await interaction.respond(
    products
      .filter(p => p.productName.toLowerCase().includes(focused))
      .map(p => ({ name: p.productName, value: p.productName }))
  );
}

module.exports = { data, execute, autocomplete };

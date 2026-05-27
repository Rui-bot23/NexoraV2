/**
 * ╔═══════════════════════════════════════════════╗
 * ║           NEXORA BOT — index.js               ║
 * ║   Licensing · Tickets · Reviews · Admin       ║
 * ╚═══════════════════════════════════════════════╝
 */

require("dotenv").config();
const { Client, GatewayIntentBits, Collection, Partials } = require("discord.js");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const chalk = require("chalk");
const { loadConfig } = require("./utils/config");
const { startApiServer } = require("./utils/api");

const config = loadConfig();

// ── Discord Client ──────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel],
});

client.commands = new Collection();
client.config = config;

// ── Load Commands ───────────────────────────────────────────────────────────
function registerCmd(cmd) {
  if (cmd?.data && cmd?.execute) client.commands.set(cmd.data.name, cmd);
}

function loadCommands(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    if (file.isDirectory()) {
      loadCommands(fullPath);
    } else if (file.name.endsWith(".js")) {
      try {
        const mod = require(fullPath);
        registerCmd(mod);
        // Support files that export multiple commands (e.g. deleteTicket, ticketPanel)
        for (const key of Object.keys(mod)) {
          if (key !== "data" && key !== "execute" && typeof mod[key] === "object") {
            registerCmd(mod[key]);
          }
        }
      } catch (err) {
        console.error(chalk.red(`[CMD] Failed to load ${fullPath}:`), err.message);
      }
    }
  }
}
loadCommands(path.join(__dirname, "commands"));

// ── Load Events ─────────────────────────────────────────────────────────────
function loadEvents(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".js"));
  for (const file of files) {
    const event = require(path.join(dir, file));
    const eventName = file.replace(".js", "");
    if (event.once) {
      client.once(eventName, (...args) => event.execute(...args, client));
    } else {
      client.on(eventName, (...args) => event.execute(...args, client));
    }
  }
}
loadEvents(path.join(__dirname, "events"));

// ── MongoDB ──────────────────────────────────────────────────────────────────
async function connectDB() {
  const uri = process.env.MONGO_URI || config.database.mongoUri;
  if (!uri) {
    console.error(chalk.red("[DB] No MongoDB URI provided. Set database.mongoUri in config.yml"));
    process.exit(1);
  }
  try {
    await mongoose.connect(uri);
    console.log(chalk.green("[DB] Connected to MongoDB"));
  } catch (err) {
    console.error(chalk.red("[DB] MongoDB connection failed:"), err.message);
    process.exit(1);
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
(async () => {
  await connectDB();

  if (config.api?.enabled) {
    await startApiServer(client, config);
  }

  const token = process.env.DISCORD_TOKEN || config.bot.token;
  if (!token) {
    console.error(chalk.red("[BOT] No bot token provided. Set bot.token in config.yml"));
    process.exit(1);
  }

  await client.login(token);
})();

process.on("unhandledRejection", (err) => {
  console.error(chalk.red("[ERROR] Unhandled rejection:"), err);
});

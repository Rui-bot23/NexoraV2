/**
 * deploy-commands.js
 * Run this once with: node deploy-commands.js
 * to register all slash commands with Discord.
 */

require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./utils/config");

const config = loadConfig();

const commands = [];

function loadCommands(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      loadCommands(fullPath);
    } else if (entry.name.endsWith(".js")) {
      try {
        const mod = require(fullPath);
        if (mod.data) commands.push(mod.data.toJSON());
        // Handle files with multiple exported commands
        for (const key of Object.keys(mod)) {
          if (key !== "data" && key !== "execute" && mod[key]?.data) {
            commands.push(mod[key].data.toJSON());
          }
        }
      } catch (err) {
        console.error(`Failed to load ${fullPath}:`, err.message);
      }
    }
  }
}

loadCommands(path.join(__dirname, "commands"));

const token    = process.env.DISCORD_TOKEN || config.bot.token;
const clientId = config.bot.clientId;
const guildId  = config.bot.guildId;

if (!token || !clientId) {
  console.error("ERROR: Missing bot token or clientId in config.yml");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`Deploying ${commands.length} slash command(s)...`);

    if (guildId) {
      // Guild-specific (instant)
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`✅ Deployed ${commands.length} commands to guild ${guildId}`);
    } else {
      // Global (takes up to 1 hour to propagate)
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`✅ Deployed ${commands.length} commands globally`);
    }
  } catch (err) {
    console.error("Failed to deploy commands:", err);
  }
})();

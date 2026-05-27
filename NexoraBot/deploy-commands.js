/**
 * deploy-commands.js
 * Registers all slash commands with Discord.
 * Reads credentials from Railway env vars (or .env locally).
 */

require("dotenv").config();
const { REST, Routes } = require("discord.js");
const fs   = require("fs");
const path = require("path");

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

// Read from env vars first, fall back to config.yml
let config = { bot: {} };
try {
  const yaml = require("js-yaml");
  config = yaml.load(fs.readFileSync(path.join(__dirname, "config.yml"), "utf8"));
} catch {}

const token    = process.env.DISCORD_TOKEN || config.bot?.token;
const clientId = process.env.CLIENT_ID     || config.bot?.clientId;
const guildId  = process.env.GUILD_ID      || config.bot?.guildId;

if (!token) {
  console.error("ERROR: Missing DISCORD_TOKEN — add it as a Railway environment variable.");
  process.exit(1);
}
if (!clientId) {
  console.error("ERROR: Missing CLIENT_ID — add it as a Railway environment variable.");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
  try {
    console.log(`Deploying ${commands.length} slash command(s)...`);

    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
      console.log(`✅ Deployed ${commands.length} commands to guild ${guildId}`);
    } else {
      await rest.put(Routes.applicationCommands(clientId), { body: commands });
      console.log(`✅ Deployed ${commands.length} commands globally`);
    }
  } catch (err) {
    console.error("Failed to deploy commands:", err);
    process.exit(1);
  }
})();

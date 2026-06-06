const chalk = require("chalk");
const { ActivityType } = require("discord.js");

const once = true;

async function execute(client) {
  // Restore persistent giveaways from DB
  const { restoreGiveaways } = require("../commands/giveaway/giveaway");
  await restoreGiveaways(client);

  const cfg = client.config;
  const b = cfg.branding || {};
  const bot = cfg.bot || {};

  // Set activity
  const activityTypes = {
    0: ActivityType.Playing,
    1: ActivityType.Streaming,
    2: ActivityType.Listening,
    3: ActivityType.Watching,
  };

  client.user.setPresence({
    status: bot.status || "online",
    activities: [{
      name: bot.activity || `${b.name || "Nexora"} Licensing`,
      type: activityTypes[bot.activityType ?? 3],
    }],
  });

  console.log(chalk.cyan(`
╔═══════════════════════════════════════╗
║          NEXORA BOT — READY           ║
╠═══════════════════════════════════════╣
║  Bot:      ${(client.user.tag + " ").padEnd(28)}║
║  Servers:  ${String(client.guilds.cache.size).padEnd(28)}║
║  Commands: ${String(client.commands.size).padEnd(28)}║
╚═══════════════════════════════════════╝
  `));
}

module.exports = { once, execute };

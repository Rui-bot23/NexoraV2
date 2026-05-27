# Nexora Bot

All-in-one Discord bot for the Nexora ecosystem. Everything is configured **directly in Discord** — no editing config files for per-server settings.

---

## Features

| System | Commands |
|--------|----------|
| ⚙️ **Setup** | `/setupwizard` · `/setup tickets` · `/setup reviews` · `/setup branding` |
| 🎫 **Tickets** | `/createticket` · `/deleteticket` · `/ticketpanel` · `/ticket close/claim/add/...` |
| 🔑 **Licensing** | `/license create/info/list/delete/suspend/unsuspend/reset/extend` |
| 📦 **Products** | `/product create/info/list/delete/edit` |
| ⭐ **Reviews** | `/review submit/delete/list/stats/blacklist` |
| 🚫 **Blacklist** | `/blacklist add/remove/list/check` |
| 🤖 **Admin** | `/nexora stats/ping/lookup` |
| 🌐 **REST API** | `POST /api/validate` · `GET /api/license/:key` · `GET /api/stats` |

---

## Quick Start

### 1. Prerequisites
- Node.js **18+**
- MongoDB ([free tier at mongodb.com](https://mongodb.com))
- Discord bot at [discord.com/developers](https://discord.com/developers)

### 2. Install
```bash
npm install
```

### 3. Fill in config.yml
Only 3 things are required — everything else is set in Discord:
```yaml
bot:
  token: "YOUR_BOT_TOKEN"
  clientId: "YOUR_CLIENT_ID"
  guildId: "YOUR_GUILD_ID"

database:
  mongoUri: "mongodb+srv://..."

developer:
  id: "YOUR_DISCORD_USER_ID"
```

### 4. Deploy slash commands
```bash
node deploy-commands.js
```

### 5. Start
```bash
node index.js
# or with auto-restart:
npm run dev
```

---

## First-Time Setup in Discord

Once the bot is online, run this in your server:

```
/setupwizard
```

This shows a checklist of every setup step with the exact command to run for each one. Follow it top to bottom:

### Step-by-step

**Tickets:**
```
/setup tickets logs channel:#transcript-logs
/setup tickets category category:#NEXORA-TICKETS
/setup tickets addrole role:@Support
/setup tickets options max_per_user:1 dm_transcript:true
```

**Add ticket categories** (like the FireDesign screenshot):
```
/createticket name:Licensing Support emoji:🔑 description:Help with license issues teampingid:@Support
/createticket name:Billing emoji:💳 description:Payment questions teampingid:@Billing
/createticket name:Bug Report emoji:🐛 description:Report a bug
/createticket name:General Support emoji:🛠️ description:General help
```

**Send the panel:**
```
/ticketpanel channel:#support
```

**Reviews:**
```
/setup reviews channel channel:#reviews
/setup reviews adminrole action:Add role:@Admin
```

**Branding:**
```
/setup branding set name:Nexora color:5865F2 footer:Nexora Support
```

---

## Licensing

### Create licenses
```
/license create product:MyApp duration:30d
/license create product:MyApp duration:lifetime max_ip:2
```

### Validate from your software (REST API)
```http
POST http://your-host:8888/api/validate
Content-Type: application/json

{
  "key": "NEXORA-XXXX-XXXX-XXXX-XXXX",
  "ip": "1.2.3.4",
  "hwid": "ABC123",
  "product": "MyApp"
}
```

**Response statuses:** `valid` · `invalid` · `suspended` · `expired` · `ip_limit` · `hwid_limit` · `blacklisted`

---

## File Structure

```
NexoraBot/
├── index.js                      # Entry point
├── deploy-commands.js            # Register slash commands
├── config.yml                    # Global config (token, DB, dev ID only)
├── commands/
│   ├── admin/
│   │   ├── setup.js              # /setup (all per-server config)
│   │   ├── setupwizard.js        # /setupwizard (guided checklist)
│   │   ├── blacklist.js          # /blacklist
│   │   └── nexora.js             # /nexora stats/ping/lookup
│   ├── license/
│   │   └── license.js            # /license
│   ├── product/
│   │   └── product.js            # /product
│   ├── tickets/
│   │   ├── createticket.js       # /createticket /deleteticket /ticketpanel /listtickets
│   │   ├── ticket.js             # /ticket (staff management)
│   │   └── transcriptHelper.js   # Shared transcript poster
│   └── reviews/
│       └── review.js             # /review
├── events/
│   ├── ready.js
│   └── interactionCreate.js      # Routes all interactions
├── models/
│   └── index.js                  # All Mongoose models incl. GuildConfig + TicketCategory
└── utils/
    ├── api.js                    # Fastify REST API
    ├── config.js                 # config.yml loader
    ├── embeds.js                 # Embed builder helpers
    └── guildConfig.js            # Per-guild DB config helper
```

---

## Deploying on Railway

See the [Railway deployment guide](https://docs.railway.app) or ask the bot for `/setupwizard` once deployed.

```
1. Push to GitHub
2. New Project → Deploy from GitHub repo
3. Add env vars: DISCORD_TOKEN, MONGO_URI, API_PORT=8888
4. Generate a domain under Settings → Networking (port 8888)
5. Run: node deploy-commands.js (locally once)
```

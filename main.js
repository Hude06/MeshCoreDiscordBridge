import { NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";
import {
  REST,
  Routes,
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  MessageFlags
} from "discord.js";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const connection = new NodeJSSerialConnection(config.SERIAL_PORT || "/dev/ttyUSB0");

// PocketMesh reacts look like: "😀@[Some User]xp8q7fcc"
const POCKETMESH_REACT_RE =
  /^\s*(?:.*?:\s*)?(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)@\[[^\]]*\]\s*[a-z0-9]{8}\s*$/iu;

function isPocketMeshReact(text) {
  if (!text) return false;
  // Normalize CRLF so ]\r\nhash still matches
  return POCKETMESH_REACT_RE.test(String(text).replace(/\r\n/g, "\n"));
}

const MESH_MAXLEN = Number(config.MESH_MAXLEN ?? 160);
const MESH_CHUNK_DELAY_MS = Number(config.MESH_CHUNK_DELAY_MS ?? 1500);

function getAlwaysForwardChannelIds() {
  // New key: DISCORD_ALWAYS_FORWARD_CHANNEL_IDS (array or string)
  const v = config.DISCORD_ALWAYS_FORWARD_CHANNEL_IDS ?? config.DISCORD_ALWAYS_FORWARD_CHANNEL_ID;

  if (!v) return new Set();

  if (Array.isArray(v)) return new Set(v.map(x => String(x)));
  return new Set([String(v)]);
}


function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function normalizeForMesh(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
// ---- Mesh send serialization queue ----
let meshSendChain = Promise.resolve();

function enqueueMeshSend(taskFn) {
  meshSendChain = meshSendChain
    .then(taskFn)
    .catch((e) => console.error("Mesh send task error:", e));
  return meshSendChain;
}

/**
 * Split a string into chunks <= maxLen, trying to break on whitespace.
 * Falls back to hard splits if a single "word" exceeds the limit.
 */
function splitByMaxLen(text, maxLen) {
  const s = String(text ?? "");
  const out = [];
  let i = 0;

  while (i < s.length) {
    const remaining = s.length - i;
    if (remaining <= maxLen) {
      out.push(s.slice(i));
      break;
    }

    // Candidate slice
    const end = i + maxLen;

    // Try to find last whitespace within the slice (avoid tiny chunks)
    const slice = s.slice(i, end);
    let breakAt = Math.max(slice.lastIndexOf(" "), slice.lastIndexOf("\n"), slice.lastIndexOf("\t"));

    // If no whitespace (or whitespace too early), hard split
    if (breakAt < Math.floor(maxLen * 0.4)) {
      breakAt = maxLen;
    }

    out.push(s.slice(i, i + breakAt).trimEnd());
    i = i + breakAt;

    // Skip leading whitespace at next chunk
    while (i < s.length && /\s/.test(s[i])) i++;
  }

  return out.filter(x => x.length > 0);
}

/**
 * Chunk + send a message to meshcore with "n/N" suffix and delay between chunks.
 * - If message fits in one chunk, sends once with NO suffix.
 * - All mesh sends are serialized via enqueueMeshSend() to prevent interleaving.
 */
async function sendMeshChunked(channelIdx, fullText) {
  const base = normalizeForMesh(fullText);
  if (!base) return;

  return enqueueMeshSend(async () => {
    // If it fits as-is, send once with no suffix.
    if (base.length <= MESH_MAXLEN) {
      if (config.DEBUG) {
        console.debug(`[debug] mesh send (single) ch=${channelIdx} len=${base.length}: "${base}"`);
      }
      await connection.sendChannelTextMessage(channelIdx, base);
      return;
    }

    // Otherwise chunk and add "n/N" suffixes.
    const suffixReserve = 6; // safe for up to " 99/99"
    const maxPayload = Math.max(1, MESH_MAXLEN - suffixReserve);
    let chunks = splitByMaxLen(base, maxPayload);

    // Recompute reserve based on actual total (handles " 100/100" etc.)
    const total = chunks.length;
    const suffixLen = (` ${total}/${total}`).length;
    const maxPayload2 = Math.max(1, MESH_MAXLEN - suffixLen);
    if (maxPayload2 !== maxPayload) {
      chunks = splitByMaxLen(base, maxPayload2);
    }

    const total2 = chunks.length;

    if (config.DEBUG) {
      console.debug(`[debug] mesh send (chunked) ch=${channelIdx} parts=${total2} maxLen=${MESH_MAXLEN} delayMs=${MESH_CHUNK_DELAY_MS}`);
    }

    for (let idx = 0; idx < total2; idx++) {
      const partNum = idx + 1;
      const suffix = ` ${partNum}/${total2}`;
      let payload = chunks[idx];

      // Final guard: ensure payload+suffix fits
      const allowed = MESH_MAXLEN - suffix.length;
      if (payload.length > allowed) payload = payload.slice(0, allowed);

      const out = payload + suffix;

      try {
        if (config.DEBUG) {
          console.debug(`[debug] mesh chunk ${partNum}/${total2} ch=${channelIdx} len=${out.length}: "${out}"`);
        }
        await connection.sendChannelTextMessage(channelIdx, out);
      } catch (e) {
        console.error(`Mesh chunk send failed ${partNum}/${total2} ch=${channelIdx}:`, e);
      }

      if (idx !== total2 - 1) {
        await sleep(MESH_CHUNK_DELAY_MS);
      }
    }
  });
}

/** =========================
 * Bridge mode state + auth
 * ========================= */
const bridgeState = {
  paused: false,
  pausedBy: null,
  pausedAt: null,
};

function isBridgePaused() {
  return bridgeState.paused === true;
}

function setBridgePaused(paused, actorTag = null) {
  bridgeState.paused = !!paused;
  bridgeState.pausedBy = paused ? actorTag : null;
  bridgeState.pausedAt = paused ? new Date().toISOString() : null;
}

function isBridgeAdminMember(member) {
  if (!member) return false;

  // Permission fallback: allow Manage Guild or Administrator
  const perms = member.permissions;
  if (perms?.has?.("Administrator") || perms?.has?.("ManageGuild")) return true;

  // Role allowlist
  const allowed = config.BRIDGE_ADMIN_ROLE_IDS || [];
  if (!Array.isArray(allowed) || allowed.length === 0) return false;

  return member.roles?.cache?.some?.(r => allowed.includes(r.id)) === true;
}

/** =========================
 * Flood protection (Discord -> Mesh)
 * ========================= */
const floodCfg = config.FLOOD_PROTECT || {};
const FLOOD_WINDOW_MS = Math.max(1, Number(floodCfg.WINDOW_SECONDS ?? 15)) * 1000;
const FLOOD_MAX = Math.max(1, Number(floodCfg.MAX_MESSAGES_PER_WINDOW ?? 6));
const FLOOD_COOLDOWN_MS = Math.max(1, Number(floodCfg.COOLDOWN_SECONDS ?? 60)) * 1000;
const FLOOD_WARN = floodCfg.WARN_IN_CHANNEL !== false;

// Per-Discord-channel tracking
const floodState = new Map(); // channelId -> { times: number[], cooldownUntil: number, warnedUntil: number }

function _getFloodRecord(channelId) {
  const key = String(channelId);
  let rec = floodState.get(key);
  if (!rec) {
    rec = { times: [], cooldownUntil: 0, warnedUntil: 0 };
    floodState.set(key, rec);
  }
  return rec;
}

/**
 * Returns true if we should allow forwarding this Discord channel's messages to Meshcore.
 * If false, we're currently rate-limited (cooldown).
 */
async function floodAllowDiscordToMesh(messageLike) {
  const channelId = String(messageLike?.channel?.id ?? "");
  if (!channelId) return true;

  const now = Date.now();
  const rec = _getFloodRecord(channelId);

  // In cooldown?
  if (rec.cooldownUntil > now) {
    if (config.DEBUG) {
      console.debug(`[debug] Flood protect: dropping discord->mesh from ${channelId} (cooldown ${Math.ceil((rec.cooldownUntil - now) / 1000)}s)`);
    }
    return false;
  }

  // Sliding window prune
  const cutoff = now - FLOOD_WINDOW_MS;
  rec.times = rec.times.filter(t => t >= cutoff);

  // Record this message
  rec.times.push(now);

  // If exceeded, start cooldown
  if (rec.times.length > FLOOD_MAX) {
    rec.cooldownUntil = now + FLOOD_COOLDOWN_MS;
    rec.times = []; // reset window for after cooldown

    if (config.DEBUG) {
      console.debug(`[debug] Flood protect: ENTER cooldown for ${channelId} (${FLOOD_COOLDOWN_MS / 1000}s)`);
    }

    // Optional: warn once per cooldown period
    if (FLOOD_WARN && rec.warnedUntil <= now) {
      rec.warnedUntil = rec.cooldownUntil;
      try {
        if (messageLike?.channel?.send) {
          await messageLike.channel.send(
            `⚠️ Bridge flood protection: pausing forwarding to Meshcore for ${Math.ceil(FLOOD_COOLDOWN_MS / 1000)}s (too many messages).`
          );
        }
      } catch (e) {
        console.error("Flood protect: failed to post warning in channel:", e);
      }
    }

    return false;
  }

  return true;
}

// Make sure we can read message content
const commands = [
  new SlashCommandBuilder()
    .setName("advert")
    .setDescription("Send a flood advert"),

  new SlashCommandBuilder()
    .setName("send")
    .setDescription("Send a message to mesh")
    .addStringOption(opt =>
      opt.setName("message")
        .setDescription("Message to send")
        .setRequired(true)
    ),

  // Bridge mode controls
  new SlashCommandBuilder()
    .setName("bridge")
    .setDescription("Control bridge forwarding mode")
    .addSubcommand(sc =>
      sc.setName("status").setDescription("Show current bridge status")
    )
    .addSubcommand(sc =>
      sc.setName("pause").setDescription("Pause forwarding (mesh <-> discord)")
    )
    .addSubcommand(sc =>
      sc.setName("resume").setDescription("Resume forwarding (mesh <-> discord)")
    ),
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

const guildIds = Array.isArray(config.GUILD_IDS)
  ? config.GUILD_IDS
  : (config.GUILD_ID ? [config.GUILD_ID] : []);

if (guildIds.length === 0) {
  throw new Error("No guild IDs configured. Set GUILD_IDS (preferred) or GUILD_ID in config.json");
}

for (const guildId of guildIds) {
  await rest.put(
    Routes.applicationGuildCommands(config.CLIENT_ID, guildId),
    { body: commands }
  );
  console.log(`Registered commands for guild ${guildId}`);
}

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

let discordChannel;

console.log("Connecting to meshcore device...");
connection.on("connected", async () => console.log("Connected to meshcore!"));

connection.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await connection.getWaitingMessages();
    console.log(`You have ${waitingMessages.length} waiting messages.`);
    for (const msg of waitingMessages) {
      console.log("Received message:", msg);
      if (msg.channelMessage) await onMeshChannelMessageReceived(msg.channelMessage);
    }
  } catch (e) {
    console.log(e);
  }
});

function getMeshChannelForDiscordChannel(discordChannelId) {
  const map = config.DISCORD_TO_MESH_ROUTES || {};
  const idx = map[String(discordChannelId)];
  if (idx === undefined || idx === null) return null;
  const n = Number(idx);
  return Number.isFinite(n) ? n : null;
}

async function onMeshChannelMessageReceived(channelMessage) {
  // Bridge pause gate: Mesh -> Discord
  if (isBridgePaused()) {
    if (config.DEBUG) console.debug("[debug] Bridge paused; dropping mesh->discord message");
    return;
  }

  const text = channelMessage?.text ?? "";
  const channelIdx = channelMessage?.channelIdx;

  // Ignore PocketMesh emoji reactions (don’t forward to Discord)
  if (isPocketMeshReact(text)) {
    if (config.DEBUG) console.debug(`[debug] Ignored PocketMesh react: "${text}"`);
    return;
  }

  // #meshmonday special-case (optional: keep as you had it)
  const meshMonday = bot.channels.cache.get(config.DISCORD_CHANNEL_ID_MESHMONDAY);
  if (text.includes("#meshmonday")) {
    if (meshMonday) meshMonday.send(text).catch(console.error);
  }

  // Language warning back to mesh + echo to routed Discord channel
  if (text.toLowerCase().includes("fuck")) {
    const idx = Number(channelMessage?.channelIdx ?? 0);

    // Serialize this mesh send so it doesn't interleave with chunked sends
    await enqueueMeshSend(() => connection.sendChannelTextMessage(idx, "Language!!!"));

    // Echo admonishment to the same Discord route
    const routeChannelIdForAdmonish = config.DISCORD_ROUTES?.[String(idx)] ?? config.DISCORD_CHANNEL_ID;
    if (routeChannelIdForAdmonish) {
      try {
        const dest = await bot.channels.fetch(routeChannelIdForAdmonish);
        if (dest?.isTextBased()) {
          await dest.send("Language!!!");
        }
      } catch (e) {
        console.error(`Failed to echo Language!!! to Discord for mesh channelIdx=${idx}:`, e);
      }
    }
  }

  // Route by Meshcore channel index
  const routeChannelId = config.DISCORD_ROUTES?.[String(channelIdx)] ?? config.DISCORD_CHANNEL_ID;
  if (!routeChannelId) return;

  try {
    const dest = await bot.channels.fetch(routeChannelId);
    if (!dest || !dest.isTextBased()) {
      console.error(`Route target not text-based: mesh channelIdx=${channelIdx} -> ${routeChannelId}`);
      return;
    }
    await dest.send(text);
  } catch (e) {
    console.error(`Failed to route mesh channelIdx=${channelIdx} to ${routeChannelId}:`, e);
  }
}

// Replace slash commands with prefix commands
bot.once("ready", async () => {
  console.log(`Logged in as ${bot.user.tag}!`);
  console.log('Listening for commands: !advert, !send <message>');
  discordChannel = await bot.channels.fetch(config.DISCORD_CHANNEL_ID);
});

async function handleAdvert(reply) {
  if (isBridgePaused()) {
    await reply("Bridge is paused; not sending advert to mesh.");
    return;
  }
  await connection.sendFloodAdvert();
  await reply("Sending Flood Advert!");
}

async function handleSend(text, authorName, reply, meshChannelIdx = 0) {
  if (!text) {
    await reply("Message required");
    return;
  }

  // Bridge pause gate: Discord -> Mesh
  if (isBridgePaused()) {
    await reply("Bridge is paused; not sending to mesh.");
    return;
  }

  await sendMeshChunked(meshChannelIdx, `${authorName}: ${text}`);
  await reply(`Sent to mesh channel ${meshChannelIdx}: ${text}`);
}

bot.on("interactionCreate", async (interaction) => {
  try {
    if (!interaction.isChatInputCommand()) return;

    // /bridge mode commands
    if (interaction.commandName === "bridge") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      if (!isBridgeAdminMember(interaction.member)) {
        await interaction.editReply("Not authorized.");
        return;
      }

      const sub = interaction.options.getSubcommand();

      if (sub === "status") {
        if (!isBridgePaused()) {
          await interaction.editReply("Bridge status: **RUNNING**");
        } else {
          const by = bridgeState.pausedBy ? ` by **${bridgeState.pausedBy}**` : "";
          const at = bridgeState.pausedAt ? ` at **${bridgeState.pausedAt}**` : "";
          await interaction.editReply(`Bridge status: **PAUSED**${by}${at}`);
        }
        return;
      }

      if (sub === "pause") {
        setBridgePaused(true, interaction.user?.tag || interaction.user?.username || "unknown");
        await interaction.editReply("Bridge paused. Forwarding is stopped.");
        return;
      }

      if (sub === "resume") {
        setBridgePaused(false);
        await interaction.editReply("Bridge resumed. Forwarding is active.");
        return;
      }

      // Should never reach here
      await interaction.editReply("Unknown subcommand.");
      return;
    }

    if (interaction.commandName === "advert") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      await handleAdvert((msg) => interaction.editReply(msg));
    }

    if (interaction.commandName === "send") {
      const text = interaction.options.getString("message");
      const name =
        interaction.member?.nickname ||
        interaction.user.username;

      // keep ephemeral confirmation to the user
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      // flood protection for /send too
      if (interaction.channel) {
        const messageLike = { channel: interaction.channel };
        if (!(await floodAllowDiscordToMesh(messageLike))) {
          await interaction.editReply("Flood protection active; try again in a bit.");
          return;
        }
      }

      // Determine route FIRST
    const meshIdx = getMeshChannelForDiscordChannel(interaction.channelId);
    if (meshIdx === null) {
      // Not mapped => don't echo, just tell the user (ephemeral)
      await interaction.editReply("This channel is not mapped to a mesh channel.");
      return;
    }

    // Mapped => optionally echo in-channel, then forward to mesh
    await interaction.channel.send(`${name}: ${text}`);
      // send to mesh + confirm back to the user
      await handleSend(text, name, (msg) => interaction.editReply(msg), meshIdx);
      return;
    }


  } catch (e) {
    console.error("interactionCreate error:", e);

    // Try to respond if possible, but don't crash
    if (interaction.isRepliable()) {
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply("Something went wrong handling that command.");
        } else {
          await interaction.reply({ content: "Something went wrong handling that command.", flags: MessageFlags.Ephemeral });
        }
      } catch (_) { }
    }
  }
});

bot.on("messageCreate", async (message) => {
  try {
    // ignore bots and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    // Always-forward mode for one specific Discord channel
    const alwaysForwardIds = getAlwaysForwardChannelIds();
    if (alwaysForwardIds.has(String(message.channel.id))) {
      // Bridge pause gate: Discord -> Mesh
      if (isBridgePaused()) {
        if (config.DEBUG) console.debug("[debug] Bridge paused; dropping discord->mesh always-forward message");
        return;
      }

      // Flood protection gate
      if (!(await floodAllowDiscordToMesh(message))) return;

      const meshIdx = getMeshChannelForDiscordChannel(message.channel.id);
      if (meshIdx === null) {
        if (config.DEBUG) console.debug(`[debug] Always-forward channel not mapped: ${message.channel.id}`);
        return;
      }

      const name = message.member?.nickname || message.author.username;

      // Optional: don't forward commands typed in that channel (keeps it cleaner)
      if (message.content.startsWith(config.identifier)) return;

      // Basic text only (skip empty)
      const content = (message.content || "").trim();
      if (!content) return;

      await sendMeshChunked(meshIdx, `${name}: ${content}`);
      return;
    }

    // only handle messages starting with prefix
    if (!message.content.startsWith(config.identifier)) return;

    const args = message.content
      .slice(config.identifier.length)
      .trim()
      .split(/\s+/);

    const command = args.shift()?.toLowerCase();

    if (command === 'advert') {
      await handleAdvert((msg) => message.channel.send(msg));
    } else if (command === 'send') {
      // Flood protection gate for prefix send
      if (!(await floodAllowDiscordToMesh(message))) return;

      const text = args.join(" ");
      const name = message.member?.nickname || message.author.username;
      const meshIdx = getMeshChannelForDiscordChannel(message.channel.id);
      if (meshIdx === null) {
        await message.channel.send("This channel is not mapped to a mesh channel.");
        return;
      }

      await handleSend(text, name, (msg) => message.channel.send(msg), meshIdx);
    }
  } catch (e) {
    console.error("Error handling messageCreate:", e);
  }
});

await connection.connect();
bot.login(config.DISCORD_TOKEN);

import { NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";
import Packet from "@liamcottle/meshcore.js/src/packet.js";
import { Client, GatewayIntentBits } from "discord.js";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const connection = new NodeJSSerialConnection(config.SERIAL_PORT || "/dev/ttyUSB0");

// Make sure we can read message content
const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
const discordChannel = bot.channels.cache.get(config.DISCORD_CHANNEL_ID);
console.log("Connecting to meshcore device...");
connection.on("connected", async () => console.log("Connected to meshcore!"));

// helper: bytes to hex
function bytesToHex(uint8Array) {
  return Array.from(uint8Array).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
connection.on(Constants.PushCodes.LogRxData, async (event) => {
  const bytes = Buffer.from(bytesToHex(event.raw), "hex");
  const packet = Packet.fromBytes(bytes);
  const json = packet;

  console.log("Parsed packet:", json);

  if (json.payload_type_string === "GRP_TXT" && json.path && json.path.length) {
    const pathBytes = Array.from(json.path); // stable copy
    let prefix = [];
    for (let i = 0; i < pathBytes.length; i++) {
      prefix.push(pathBytes[i]); // accumulate full prefix up to this hop
      console.log("Current PREFIX:", bytesToHex(Uint8Array.from(prefix)));
    }
    console.log("FINAL PATH:", prefix);

  }
});



connection.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await connection.getWaitingMessages();
    for (const msg of waitingMessages) {
      // console.log("Received message: TEST", msg);
      console.log("Received message:", msg);
      if (msg.channelMessage) await onMeshMessagedReceived(msg.channelMessage);
    }
  } catch (e) {
    console.log(e);
  }
});

// connection.on(Constants.PushCodes.AdvertReceived, (advert) => console.log("Advert received:", advert));

async function onMeshMessagedReceived(message) {
  // console.log(`Received channel message: ${message.text}`);
  const meshMonday = bot.channels.cache.get(config.DISCORD_CHANNEL_ID_MESHMONDAY);
  if (message.text.includes("#meshmonday")) {
    if (meshMonday) meshMonday.send(message.text).catch(console.error);
  }
  if (message.text.toLowerCase().includes("ping")) {
    await connection.sendChannelTextMessage(0, "pong");
  }
  if (discordChannel) await discordChannel.send(message.text).catch(console.error);
}

// Replace slash commands with prefix commands
bot.once("ready", () => {
  console.log(`Logged in as ${bot.user.tag}!`);
  console.log('Listening for commands: !advert, !send <message>');
});

bot.on("messageCreate", async (message) => {
  try {
    // ignore bots and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    // only handle messages starting with '!'
    if (!message.content.startsWith(config.identifier)) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === 'advert') {
      try {
        await connection.sendFloodAdvert();
        await discordChannel.send("Sending Flood Advert!");
      } catch (err) {
        console.error("Failed to send flood advert:", err);
        await discordChannel.send("Failed to send flood advert. Check logs.");
      }
      return;
    } else if (command === 'send') {
      const text = args.join(' ');
      if (!text) {
        await message.reply('Send a message');
        return;
      }
      try {
        const member = message.member;
        const userId = member?.nickname || message.author.username;
        await connection.sendChannelTextMessage(0, `${userId}: ${text}`);
        await discordChannel.send(`Sent: ${text}`);
      } catch (err) {
        console.error("Failed to send channel text message:", err);
        await discordChannel.send("Failed to send message to meshcore. Check logs.");
      }
      return;

    }
  } catch (e) {
    console.error("Error handling messageCreate:", e);
  }
});

await connection.connect();
bot.login(config.DISCORD_TOKEN);

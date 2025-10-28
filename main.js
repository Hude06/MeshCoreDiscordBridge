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

console.log("Connecting to meshcore device...");
connection.on("connected", async () => console.log("Connected to meshcore!"));

// helper: bytes to hex
function bytesToHex(uint8Array) {
  return Array.from(uint8Array).map(byte => byte.toString(16).padStart(2, '0')).join('');
}

let lastRssi = null;
let lastSnr = null;

connection.on(Constants.PushCodes.LogRxData, async (event) => {
  // console.log("LogRxData", event);
  // console.log(bytesToHex(event.raw));

  const bytes = Buffer.from(bytesToHex(event.raw), "hex");

  const packet = Packet.fromBytes(bytes);
  const json = (packet);
  // console.log("Parsed packet:", json.path);
  const contacts = await connection.getContacts();

  for (const contact of contacts) {
    // console.log("Contact:", contact,contact.publicKey);
    // const base64 = Buffer.from(contact.publickey).toString('base64');
    // console.log(base64);
    const hex = Buffer.from(contact.publicKey).toString('hex');
    // console.log("Contact hex:", hex.slice(0,2));
    const contactPrefix = hex.slice(0, 2);
    // console.log(json.path,contactPrefix)
    for (let i = 0; i < json.path.length; i++) {
      console.log(typeof(json.path[i]), typeof(contactPrefix));
      if (json.path[i] === contactPrefix) {
        console.log("Matched contact:", contact.name);
      }
    }
  }
  lastRssi = event.lastRssi;
  lastSnr = event.lastSnr;
  console.log("SNR AND RSSI", event.lastSnr, event.lastRssi);
});

connection.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await connection.getWaitingMessages();
    for (const msg of waitingMessages) {
      // console.log("Received message: TEST", msg);
      if (msg.channelMessage) await onChannelMessageReceived(msg.channelMessage);
    }
  } catch (e) {
    console.log(e);
  }
});

// connection.on(Constants.PushCodes.AdvertReceived, (advert) => console.log("Advert received:", advert));

async function onChannelMessageReceived(message) {
  // console.log(`Received channel message: ${message.text}`);
  const meshMonday = bot.channels.cache.get(config.DISCORD_CHANNEL_ID_MESHMONDAY);
  if (message.text.includes("#meshmonday")) {
    if (meshMonday) meshMonday.send(message.text).catch(console.error);
  }
  if (message.text.toLowerCase().includes("ping")) {
    const rssiPart = lastRssi ? ` (RSSI: ${lastRssi} dBm` : "";
    const snrPart = lastSnr ? `, SNR: ${lastSnr} dB)` : ")";
    await connection.sendChannelTextMessage(0, "pong" + (rssiPart || snrPart ? `${rssiPart}${snrPart}` : ")"));
  }
  const channel = bot.channels.cache.get(config.DISCORD_CHANNEL_ID);
  if (channel) await channel.send(message.text).catch(console.error);
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
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/\s+/);
    const command = args.shift().toLowerCase();

    if (command === 'advert') {
      try {
        await connection.sendFloodAdvert();
        await message.channel.send("Sending Flood Advert!");
      } catch (err) {
        console.error("Failed to send flood advert:", err);
        await message.channel.send("Failed to send flood advert. Check logs.");
      }
      return;
    }

    if (command === 'send') {
      const text = args.join(' ');
      if (!text) {
        await message.reply('Usage: `!send <message>`');
        return;
      }
      try {
        const userId = message.author.username;
        await connection.sendChannelTextMessage(0, `${userId}: ${text}`);
        await message.channel.send(`Sent: ${text}`);
      } catch (err) {
        console.error("Failed to send channel text message:", err);
        await message.channel.send("Failed to send message to meshcore. Check logs.");
      }
      return;
    }
  } catch (e) {
    console.error("Error handling messageCreate:", e);
  }
});

await connection.connect();
bot.login(config.DISCORD_TOKEN);

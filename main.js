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

  console.log("Parsed packet:", json);

    // console.log(json.path,contactPrefix,hex,json)
  const path = [];
  // console.log(json.payload_type_string)
  if (json.payload_type_string === "GRP_TXT") {
    for (let i = 0; i < json.path.length; i++) {
      // const byte = parseInt(json.path[i], 16);
      console.log("FULL PATH IS",json.path,"FIRST IS ", json.path[0]);

      const contact = await connection.findContactByPublicKeyPrefix([json.path[i]]);
      // console.log("Contact is ",contact.advName);  
      if (contact) {
        path.push(contact.advName);
        console.log("path so far", path);
      }
      console.log("LENGTH OF PATH",json.path.length,"INCERMENT WE ARE ON", i);
    }
  }
});

connection.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await connection.getWaitingMessages();
    for (const msg of waitingMessages) {
      // console.log("Received message: TEST", msg);
      console.log("Received message:", msg);
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
    await connection.sendChannelTextMessage(0, "pong");
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
    if (!message.content.startsWith(config.identifier)) return;

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

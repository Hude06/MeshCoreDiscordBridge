import { NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";
import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const connection = new NodeJSSerialConnection(config.SERIAL_PORT || "/dev/ttyUSB0");
const bot = new Client({
  intents: [GatewayIntentBits.Guilds],
});

bot.once("ready", async () => {
  console.log(`Logged in as ${bot.user.tag}!`);

  // Register slash commands for this guild
  const commands = [
    new SlashCommandBuilder().setName('advert').setDescription('Send a flood advert'),
    new SlashCommandBuilder()
      .setName('send')
      .setDescription('Send a message to meshcore')
      .addStringOption(option =>
        option.setName('message').setDescription('Message to send').setRequired(true)
      )
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(bot.user.id, config.GUILD_ID), { body: commands });

  console.log("Slash commands registered!");
});

bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName } = interaction;

  if (commandName === "advert") {
    await connection.sendFloodAdvert();
    await interaction.reply("Sending Flood Advert!");
  }

  if (commandName === "send") {
    const message = interaction.options.getString("message");
    const userId = interaction.user.username;
    await connection.sendChannelTextMessage(0, `${userId}: ${message}`);
    await interaction.reply(`Sent: ${message}`);
  }
});

console.log("Connecting to meshcore device...");
connection.on("connected", async () => console.log("Connected to meshcore!"));
function bytesToHex(uint8Array) {
    return Array.from(uint8Array).map(byte => byte.toString(16).padStart(2, '0')).join('');
}
connection.on(Constants.PushCodes.LogRxData, async (event) => {
    // console.log("LogRxData", event)
    // console.log(bytesToHex(event.raw));
    console.log("SNR AND RSSI",event.lastSnr, event.lastRssi);
});
connection.on(Constants.PushCodes.MsgWaiting, async () => {
  try {
    const waitingMessages = await connection.getWaitingMessages();
    for (const msg of waitingMessages) {
      if (msg.channelMessage) await onChannelMessageReceived(msg.channelMessage);
    }
  } catch (e) {
    console.log(e);
  }
});
connection.on(Constants.PushCodes.AdvertReceived, (advert) => console.log("Advert received:", advert));

async function onChannelMessageReceived(message) {
  console.log(`Received channel message: ${message.text}`);
  const meshMonday = bot.channels.cache.get(config.DISCORD_CHANNEL_ID_MESHMONDAY)
  if (message.text.includes("#meshmonday")) {
    meshMonday.send(message.text);
  }
  if (message.text.toLowerCase().includes("ping")) {

    await connection.sendChannelTextMessage(0, "pong");
  }
  const channel = bot.channels.cache.get(config.DISCORD_CHANNEL_ID);
  if (channel) await channel.send(message.text);
}

await connection.connect();
bot.login(config.DISCORD_TOKEN);

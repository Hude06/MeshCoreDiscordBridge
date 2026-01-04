import { NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";
import {
  REST,
  Routes,
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
} from "discord.js";
import fs from "fs";

const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const connection = new NodeJSSerialConnection(config.SERIAL_PORT || "/dev/ttyUSB0");

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
].map(c => c.toJSON());

const rest = new REST({ version: "10" }).setToken(config.DISCORD_TOKEN);

await rest.put(
  Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
  { body: commands }
);
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
      // console.log("Received message: TEST", msg);
      console.log("Received message:", msg);
      if (msg.channelMessage) await onMeshMessagedReceived(msg.channelMessage);
    }
  } catch (e) {
    console.log(e);
  }
});


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
bot.once("ready", async () => {
  console.log(`Logged in as ${bot.user.tag}!`);
  console.log('Listening for commands: !advert, !send <message>');
  discordChannel = await bot.channels.fetch(config.DISCORD_CHANNEL_ID);

});

async function handleAdvert(reply) {
  await connection.sendFloodAdvert();
  await reply("Sending Flood Advert!");
}

async function handleSend(text, authorName, reply) {
  if (!text) {
    await reply("Message required");
    return;
  }

  await connection.sendChannelTextMessage(0, `${authorName}: ${text}`);
  await reply(`Sent: ${text}`);
}
bot.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "advert") {
    await interaction.deferReply({ ephemeral: true });
    await handleAdvert((msg) => interaction.editReply(msg));
  }

  if (interaction.commandName === "send") {
    const text = interaction.options.getString("message");
    const name =
      interaction.member?.nickname ||
      interaction.user.username;

    await interaction.deferReply({ ephemeral: true });
    await handleSend(text, name, (msg) => interaction.editReply(msg));
  }
});
bot.on("messageCreate", async (message) => {
  try {
    // ignore bots and DMs
    if (message.author.bot) return;
    if (!message.guild) return;

    // only handle messages starting with '!'
    if (!message.content.startsWith(config.identifier)) return;

const args = message.content
  .slice(config.identifier.length)
  .trim()
  .split(/\s+/);

const command = args.shift()?.toLowerCase();

    if (command === 'advert') {
      await handleAdvert((msg) => message.channel.send(msg));
    } else if (command === 'send') {
      const text = args.join(" ");
      const name = message.member?.nickname || message.author.username;
      await handleSend(text, name, (msg) => message.channel.send(msg));
    }
  } catch (e) {
    console.error("Error handling messageCreate:", e);
  }
});

await connection.connect();
bot.login(config.DISCORD_TOKEN);

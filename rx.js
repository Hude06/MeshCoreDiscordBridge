

import { TCPConnection, NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
dotenv.config();
// serial connections are supported by "companion_radio_usb" firmware
const connection = new NodeJSSerialConnection(process.env.SERIAL_PORT || "/dev/ttyUSB0");
const bot1 = new Client({
  intents: [
    GatewayIntentBits.Guilds,            // For server-related events
    GatewayIntentBits.GuildMessages,     // For message events in servers
    GatewayIntentBits.MessageContent     // To read message content
  ]
});
if (process.env.DISCORDBOT_TOKEN2) {
    const bot2 = new Client({
        intents: [
            GatewayIntentBits.Guilds,            // For server-related events
            GatewayIntentBits.GuildMessages,     // For message events in servers
            GatewayIntentBits.MessageContent     // To read message content
        ]
    });
    bot2.login(process.env.DISCORDBOT_TOKEN2);
    bot2.once("ready", () => {
        console.log(`Logged in as ${bot2.user.tag}!`);
    });
}
bot1.once("ready", () => {
  console.log(`Logged in as ${bot1.user.tag}!`);
});

bot1.login(process.env.DISCORD_TOKEN);
console.log("Connecting to meshcore device...");
// wait until connected
connection.on("connected", async () => {

    // we are now connected
    console.log("connected!");

    console.log("Sending Message");
    bot1.on("messageCreate", async (message) => {
        if (message.author.bot) return;
        const userId = message.author.id; 

    if (message.content.startsWith("!send")) {
        const content = message.content.slice(5).trim(); // remove "!send" and trim spaces

        if (content.length === 0) {
        message.reply("You need to tell me what to send!");
        } else {
        message.reply(content);
        console.log(`Sending message to meshcore: ${content}`);
        await connection.sendChannelTextMessage(0, userId + " " + content);
        }
    }
    });
    if (process.env.DISCORDBOT_TOKEN2) {
        bot2.on("messageCreate", async (message) => {
            if (message.author.bot) return;
            const userId = message.author.id;

            if (message.content.startsWith("!send")) {
                const content = message.content.slice(5).trim(); // remove "!send" and trim spaces

                if (content.length === 0) {
                    message.reply("You need to tell me what to send!");
                } else {
                    message.reply(content);
                    console.log(`Sending message to meshcore: ${content}`);
                    await connection.sendChannelTextMessage(0, userId + " " + content);
                }
            }
        });
    }

});
connection.on(Constants.PushCodes.MsgWaiting, async () => {
    console.log("Message waiting event received");

    try {

        const waitingMessages = await connection.getWaitingMessages();

        for(const message of waitingMessages){

            if(message.channelMessage) {

                await onChannelMessageReceived(message.channelMessage);

            }

        }

    } catch(e) {

        console.log(e);

    }

});

async function onChannelMessageReceived(message) {
    console.log(`Received channel message: ${message.text}`);

    // Replace with your channel ID
    const channel = bot1.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
    let meshmondaychanel = null
    if (process.env.DISCORD_CHANNEL_ID_MESHMONDAY) {
        meshmondaychanel = bot1.channels.cache.get(process.env.DISCORD_CHANNEL_ID_MESHMONDAY);
    }


    if (channel) {
        if (message.text.toLowerCase().includes("#meshmonday".toLowerCase())) {
            console.log("Mesh Monday message received, ignoring.");
            if (meshmondaychanel !== null) {
                await meshmondaychanel.send(message.text);

            }
        }
        await channel.send(message.text);
        if (process.env.DEBUG) {
            await channel.send(JSON.stringify(message))
        }
    } else {
        console.log("Channel not found!");
    }
}

// connect to meshcore device
await connection.connect();

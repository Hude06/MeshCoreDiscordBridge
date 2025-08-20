

import { TCPConnection, NodeJSSerialConnection, Constants } from "@liamcottle/meshcore.js";
import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";
dotenv.config();
// serial connections are supported by "companion_radio_usb" firmware
const connection = new NodeJSSerialConnection(process.env.SERIAL_PORT || "/dev/ttyUSB0");
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,            // For server-related events
    GatewayIntentBits.GuildMessages,     // For message events in servers
    GatewayIntentBits.MessageContent     // To read message content
  ]
});
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.login(process.env.DISCORD_TOKEN);
console.log("Connecting to meshcore device...");
// wait until connected
connection.on("connected", async () => {

    // we are now connected
    console.log("connected!");

    // log contacts
    const channel = await connection.findChannelByName("Public");
    if(!channel){

        console.log("Channel not found");

        await connection.close();

        return;

    }
    console.log("Sending Message");
    client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.content.startsWith("!send")) {
        const content = message.content.slice(5).trim(); // remove "!send" and trim spaces

        if (content.length === 0) {
        message.reply("You need to tell me what to send!");
        } else {
        message.reply(content);
        console.log(`Sending message to meshcore: ${content}`);
        await connection.sendChannelTextMessage(0, content);
        

        }
    }
    });

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
    const channel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID);
    let meshmondaychanel = null
    if (process.env.DISCORD_CHANNEL_ID_MESHMONDAY) {
        meshmondaychanel = client.channels.cache.get(process.env.DISCORD_CHANNEL_ID_MESHMONDAY);
    }


    if (channel) {
        if (message.text.toLowerCase().includes("#meshmonday".toLowerCase())) {
            console.log("Mesh Monday message received, ignoring.");
            if (meshmondaychanel !== null) {
                await meshmondaychanel.send(message.text);

            }
        }
        await channel.send(message.text);
        await channel.send(JSON.stringify(message))
    } else {
        console.log("Channel not found!");
    }
}

// connect to meshcore device
await connection.connect();

#!/usr/bin/python
import asyncio
from meshcore import MeshCore
from meshcore import SerialConnection
import discord
import time

CHANELID = "1360172851197640894"

class Client(discord.Client):
    async def on_ready(self):
        print(f'Logged in as {self.user} (ID: {self.user.id})')
        print('------')
        self.channel = self.get_channel(int(CHANELID))
        if self.channel:
            await self.channel.send("Mesh Core RX is online!")

    async def on_message(self, message):
        if message.author == self.user:
            return
        # Handle incoming messages if needed

async def main():
    PORT = "/dev/tty.usbmodem1301"
    BAUDRATE = 115200
    
    # Connect to the Serial Port
    con = SerialConnection(PORT, BAUDRATE)
    await con.connect()
    await asyncio.sleep(0.1)  # time for transport to establish

    mc = MeshCore(con)
    await mc.connect()

    # Main loop to receive messages
    while True:
        message = await mc.get_msg()  # Retrieve the message
        if message:
            print(f"Received message: {message['text']}")
            if client.channel:
                await client.channel.send(message['text'])
        
        await asyncio.sleep(0.1)  # Small delay to avoid high CPU usage


# Setup Discord Bot with intents
intents = discord.Intents.default()
intents.message_content = True

# Create the Discord client instance
client = Client(intents=intents)

# Run the Discord client and the mesh network concurrently
async def start():
    # Run both the bot and the mesh connection within the same event loop
    await asyncio.gather(
        client.start('ADD YOUR DISCORD TOKEN HERE'),
        main()
    )

# Run the async function that starts both tasks
asyncio.run(start())

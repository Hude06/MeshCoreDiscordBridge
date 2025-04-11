#!/usr/bin/python
import asyncio
from meshcore import MeshCore, SerialConnection
import discord

CHANNEL_ID = 1360172851197640894  # as int

class Client(discord.Client):
    def __init__(self, queue, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.queue = queue
        self.channel = None

    async def on_ready(self):
        print(f'Logged in as {self.user} (ID: {self.user.id})')
        self.channel = self.get_channel(CHANNEL_ID)
        if self.channel:
            await self.channel.send("Mesh Core RX is online!")

    async def on_message(self, message):
        if message.author.id == self.user.id:
            return
        if message.content.startswith("$send"):
            msg = message.content.removeprefix("$send").strip()
            await self.queue.put(msg)
            await self.channel.send(f"Sent MSG: {msg}")

async def mesh_loop(queue, client):
    con = SerialConnection("/dev/tty.usbmodem1301", 115200)
    await con.connect()
    await asyncio.sleep(0.1)
    mc = MeshCore(con)
    await mc.connect()
    await mc.ensure_contacts()

    while True:
        incoming = await mc.get_msg()
        if incoming and client.channel:
            await client.channel.send(incoming["text"])

        if not queue.empty():
            msg = await queue.get()
            print(f"Sending: {msg}")
            await mc.send_chan_msg(0, msg)

        await asyncio.sleep(0.05)

async def main():
    queue = asyncio.Queue()
    intents = discord.Intents.default()
    intents.message_content = True
    client = Client(queue, intents=intents)

    await asyncio.gather(
        client.start("DISCORD_TOKEN"),
        mesh_loop(queue, client)
    )

if __name__ == "__main__":
    asyncio.run(main())



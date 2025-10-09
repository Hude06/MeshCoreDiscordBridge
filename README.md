# Meshcore → Discord Bot

A small Node.js bridge that forwards Meshcore (radio) messages to Discord channels and lets you send messages from Discord to Meshcore.

---

## Prerequisites
- Node.js (v16+ recommended) and `npm`  
- Access to the [Discord Developer Portal](https://discord.com/developers/applications)  
- Serial access to your Meshcore radio (e.g. `/dev/ttyUSB0`, `/dev/cu.*`, or `COM3` on Windows)

---

## Install
```bash
npm install
```

---

## Quick start / Run
```bash
node main.js
```
---

## Configuration — `.env`
Create a `.env` file in the project root and add your secrets and IDs. Example:

```
# Primary Discord bot
DISCORD_TOKEN=your_bot_token_here
DISCORD_CHANNEL_ID=123456789012345678

# Serial port to your radio
SERIAL_PORT=/dev/ttyUSB0

# Optional: enable debug logging
DEBUG=true
```

### Example `.env` (complete)
```
DISCORD_TOKEN=EXAMPLE_TOKEN
DISCORD_CHANNEL_ID=123456789012345678
SERIAL_PORT=/dev/ttyUSB0
DEBUG=true

```

---

## Discord Developer Portal — Bot setup
1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a new application. Create a Bot under that application.  
2. Copy the **BOT token** and add it to your `.env` as `DISCORD_TOKEN`.  
3. Under the **Bot** settings:
   - Enable all **Privileged Gateway Intents**
4. Invite the bot to your server using OAuth2 (use the OAuth2 URL builder). You can give it **Administrator**

---

## Running a second bot
To run two bots at once, add a second set of env variables with clear names:

```
DISCORD_TOKEN_2=your_second_bot_token
DISCORD_CHANNEL_ID_2=987654321098765432
DISCORD_CHANNEL_ID_MESHMONDAY_2=111222333444555666
```

Create a second bot in the Developer Portal and repeat the same setup steps for it.

---

## MeshMonday feature
MeshMonday is a fun feature that forwards Meshcore messages tagged `#meshmonday` to a dedicated Discord channel. This is just a fun thing I added so every monday people send #meshmonday over the mesh and see if they hit the monitor or not

Enable it by adding the MeshMonday channel ID to `.env`:

```
DISCORD_CHANNEL_ID_MESHMONDAY=123456789012345678
```

When enabled, the bot watches for MeshMonday-tagged messages and posts them to that channel.

---

## Commands (Discord)
Use these commands in your configured Discord channel:

- `!send <message>` — send `<message>` over the Meshcore / radio link.  
- `!advert` — send an advert (implementation-specific).  
- `!login <RepeaterName>` — attempt login for a repeater (**case-sensitive**).  
  - The bot must use either hello or default password for guest telemetry data


---

## Debug / Logging
- To enable verbose debug messages in Discord logs, add:
  ```
  DEBUG=true
  ```
  to your `.env`.  
- Remove `DEBUG` or set it to `false` if you do not want debug messages.

---

## Troubleshooting
- **Intents error**: Ensure required Privileged Gateway Intents are enabled in the Developer Portal and requested in your code when creating the Discord client.  
- **Channel not working**: Verify `DISCORD_CHANNEL_ID` is a numeric ID (enable Developer Mode in Discord → copy ID) and the bot has read/write permissions in that channel.  
- **Serial port issues**: Make sure `SERIAL_PORT` matches your OS device path and that your user has permission to access the device. Example ports:
  - Linux: `/dev/ttyUSB0` or `/dev/ttyACM0`  
  - macOS: `/dev/cu.usbserial-XXXXX`  
  - Windows: `COM3`  
- **Entry file confusion**: If `node main.js` fails, check `package.json` for `main` or `scripts.start` to find the correct entry.

---

## Contributing / Support
- Open issues or pull requests on the repo.  
- For fast help, ping in the Meshcore Discord.

---

## License
*(MIT)*


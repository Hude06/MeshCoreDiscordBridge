# Meshcore Bridge to Discord
### Open terminal and git clone this URL. Only clone the DEV branch if you know what you are doing the code might not be production ready
## Meshcore Setup
Flash your Meshcore node with the latest client firmware over USB.  
Update `config.json` and set the correct serial port for your node.

## Discord Setup
1. Open the **Discord Developer Portal** and create a new application.
2. Go to the **Bot** tab and enable:
   - Presence Intent  
   - Server Members Intent  
   - Message Content Intent
3. Copy your bot token into the config file.
4. Open the Discord channel you want the bot to use, right-click it, and copy the channel ID into the config file.
5. Set the command identifier used for Discord → Mesh commands (e.g., `!`, `$`, `#`).

## Commands

### Discord → Mesh
- `!send "message"` — Sends a message over the mesh.
- `!advert` — Sends an advert from the node connected to the bot.

### Mesh → Discord
- All messages received from the mesh are forwarded to the configured Discord channel.
- If a mesh message contains **"ping"**, the bot replies with **"ping"** over the mesh.

# MeshCore ↔ Discord Bridge

This project provides a bridge between **MeshCore** and **Discord**, allowing messages to flow between RF mesh networks and Discord channels.

This fork significantly extends the original project with **multi-channel routing, multi-server support, flood protection, message chunking, and operator controls**, making it suitable for real-world mesh deployments where bandwidth is limited and message loss is possible.

---

## Prerequisites

* **Node.js:** v18.0.0 or higher (Required for top-level await).
* **Hardware:** A MeshCore node flashed with the latest client firmware.
* **Process Manager:** PM2 is recommended for 24/7 background operation.

---

## Installation & Setup

### 1. Hardware & System
1. Flash your MeshCore node and connect it via USB.
2. Identify your serial port:
   - Linux: /dev/ttyUSB0 or /dev/ttyACM0
   - macOS: /dev/tty.usbserial-XXXX
   - Windows: COM3, COM4, etc.
3. Install dependencies:
   `npm install`

### 2. Discord Developer Portal Setup
1. Open the Discord Developer Portal and create a new application.
2. In the **Bot** tab, enable:
   - Presence Intent  
   - Server Members Intent  
   - Message Content Intent
3. Copy your **Bot Token** into config.json.
4. Go to **OAuth2 -> URL Generator**, select 'bot' and 'applications.commands', then use the generated link to invite the bot to your server.

### 3. Configuration (config.json)
Create a config.json in the root directory. Note: JSON does not support comments (//), so ensure the file only contains valid JSON data.

{
  "identifier": "!",
  "CLIENT_ID": "YOUR_APPLICATION_ID",
  "DISCORD_TOKEN": "YOUR_BOT_TOKEN",
  "SERIAL_PORT": "/dev/ttyUSB0",
  "GUILD_ID": "YOUR_SERVER_ID",
  "DISCORD_CHANNEL_ID": "YOUR_PRIMARY_CHANNEL_ID"
}

---

## Running the Bridge (PM2)

To keep the bridge running in the background and auto-restart on boot:

1. **Start the bridge:**
   `sudo npm install pm2@latest -g`
   `pm2 start main.js --name mesh-bridge`
2. **Monitor logs:**
   `pm2 logs mesh-bridge`
3. **Setup boot persistence:**
   `pm2 startup` (and run the command it generates)
   `pm2 save`

---

## Message Flow Overview

### Mesh → Discord
- Mesh messages are routed based on mesh channel index.
- PocketMesh emoji “reaction” messages are automatically ignored.
- Profanity triggers a warning back to the originating mesh channel.
- Forwarding can be paused globally via command.

### Discord → Mesh
- Messages can be sent via Slash commands (/send) or Prefix commands (!send).
- Long messages are safely chunked and paced (e.g., 1/2, 2/2).
- Flood protection prevents accidental mesh overload.

---

## Commands

### Discord → Mesh
- /send <message> — Send text to the mesh.
- /advert — Sends a flood advert from the connected node.

### Bridge Control Commands
(Requires Administrator or Manage Guild roles)
- /bridge status — Show current forwarding state.
- /bridge pause — Pause all mesh-Discord forwarding.
- /bridge resume — Resume normal operation.

---

## Advanced Features

### Flood Protection
- Per-Discord-channel rate limiting is enforced to protect mesh bandwidth.

### Mesh Message Chunking & Reliability
- Automatic message chunking for long Discord messages.
- n/N counters added only when chunking is required.
- Serialized send queue to prevent message interleaving.

# Meshcore to Discord Bot

## Install
```
npm init -y
npm install
```
Create a .env file and add your discord bot token
Example ENV code
```
DISCORD_TOKEN=EXAMPLETOKEN
DISCORD_CHANNEL_ID=
SERIAL_PORT=/dev/
```


Then run the node using ``` node rx.py ```make sure your chanel is correct in the code and you have the correct port selected



Feel free to open Issues or ping me in the Meshcore Discord

### Running 2 Bots at the same time
```
DISCORDBOT_TOKEN2=
DISCORD_CHANNEL_ID2=
DISCORD_CHANNEL_ID_MESHMONDAY2=
```
You just need to make a second discord bot and do the exact same things you did before and put all the info in here

## MeshMonday
- Meshmonday every monday everyone tries to send out messages with #meshmonday the script will then send them to a specific chanel. Add the chanel id to the ENV to enable meshmonday DISCORD_CHANNEL_ID_MESHMONDAY = chanel ID
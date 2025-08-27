# Meshcore to Discord Bot

## Install
```
npm install
```
## Discord BOT setup
- Go to discord dev and log in and create a new bot
- When you create the bot make sure you save the BOT token you will need that for your ENV file
### Permisions for the BOT
- Make sure you enable INTENTS for your bot that is an error you will get if you don't enable those.
- The easiest way is to just give the bot admin privligies but if you don't want to it should just need chanel read and write and text read and write

 - Create a .env file and add your discord bot token
### Example ENV code
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


## Debug
Set DEBUG=true if you want to get debug messages in your discord log. If you do not want these make sure you remove it and do NOT have it in your ENV file.
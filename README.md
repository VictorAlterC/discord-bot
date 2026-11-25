# Discord soundboard bot

Joins your voice channel and plays Discord’s own soundboard: the default sounds plus sounds uploaded to the server. It does not stream audio files. `@discordjs/voice` only keeps the bot in the channel. Playback uses Discord’s soundboard API.

Requires Node.js 22.12 or newer.

## Setup

1. In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and a bot. Leave privileged intents off.
2. Copy `.env.example` to `.env` and set `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Set `DISCORD_GUILD_ID` to your test server so command updates apply immediately. Without it, commands are registered globally and can take up to an hour.
3. Invite the bot with the `bot` and `applications.commands` scopes and these permissions: View Channel, Connect, Speak, Use Soundboard, Use External Sounds.

   Replace `CLIENT_ID`:

   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=39582421746688&scope=bot%20applications.commands
   ```

4. Install and register commands, then start the bot:

   ```
   npm install
   npm run deploy
   npm start
   ```

## Commands

All replies are only visible to you.

- `/join` — join the voice channel you are in
- `/leave` — disconnect and stop listening
- `/sounds` — list default sounds, then this server’s sounds
- `/play sound:<name>` — play a sound. Suggestions filter as you type. If the bot is not already in your channel, it joins first.
- `/listen` — transcribe speech in the channel and play a sound when someone says a phrase from `triggers.json`
- `/unlisten` — stop transcribing. The bot stays in the channel.

The bot joins undeafened and unmuted. Discord refuses soundboard playback when the bot is muted, deafened, or suppressed (stage channels are rejected for that reason).

## Voice phrases

`triggers.json` maps a spoken phrase to a soundboard name (the same name `/play` accepts):

```json
[
  { "phrase": "uwu", "sound": "sound1" }
]
```

Add `"source": "default"` or `"source": "guild"` when you need one list specifically. Without it, a server sound with that name wins over a default sound.

The bot loads this file at startup. Restart after editing it. A phrase fires when it appears as whole words inside the transcript, after lowercasing and stripping punctuation. If several phrases match one utterance, the longest one plays.

`/listen` runs local Whisper (`Xenova/whisper-tiny`) on CPU. The first time, it downloads the model into `.cache/`. Nothing is sent to a speech API. The bot only transcribes while listening is on. Check the terminal for lines starting with `Heard` if a phrase is misheard; the text in `triggers.json` has to match that transcript.

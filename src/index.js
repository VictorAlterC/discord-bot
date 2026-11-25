import { Client, Collection, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTriggers } from './lib/triggers.js';

try {
  loadTriggers();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

client.commands = new Collection();

const commandsDir = join(dirname(fileURLToPath(import.meta.url)), 'commands');
const files = (await readdir(commandsDir)).filter((file) => file.endsWith('.js'));
for (const file of files) {
  const command = await import(`./commands/${file}`);
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Logged in as ${readyClient.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    if (interaction.isAutocomplete()) {
      if (command.autocomplete) await command.autocomplete(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;
    await command.execute(interaction);
  } catch (error) {
    console.error(error);
    if (interaction.isAutocomplete()) return;
    const payload = { content: 'Something went wrong.', flags: MessageFlags.Ephemeral };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload).catch(() => {});
    } else if (interaction.isRepliable()) {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

if (!process.env.DISCORD_TOKEN) {
  console.error('Missing DISCORD_TOKEN. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

await client.login(process.env.DISCORD_TOKEN);

import { REST, Routes } from 'discord.js';
import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const commandsDir = join(dirname(fileURLToPath(import.meta.url)), 'commands');
const files = (await readdir(commandsDir)).filter((file) => file.endsWith('.js'));
const commands = [];
for (const file of files) {
  const command = await import(`./commands/${file}`);
  commands.push(command.data.toJSON());
}

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
if (!token || !clientId) {
  console.error('DISCORD_TOKEN and DISCORD_CLIENT_ID are required.');
  process.exit(1);
}

const rest = new REST().setToken(token);
const guildId = process.env.DISCORD_GUILD_ID;

if (guildId) {
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log(`Registered ${commands.length} commands in guild ${guildId}.`);
} else {
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log(`Registered ${commands.length} global commands.`);
}

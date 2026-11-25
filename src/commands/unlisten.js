import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { stopListening } from '../lib/listen.js';

export const data = new SlashCommandBuilder()
  .setName('unlisten')
  .setDescription('Stop listening for phrases')
  .setDMPermission(false);

export async function execute(interaction) {
  const stopped = stopListening(interaction.guildId);
  await interaction.reply({
    content: stopped
      ? 'Stopped listening. I am still in the voice channel.'
      : 'I am not listening.',
    flags: MessageFlags.Ephemeral,
  });
}

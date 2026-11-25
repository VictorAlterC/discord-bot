import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { stopListening } from '../lib/listen.js';
import { leaveVoice } from '../lib/voice.js';

export const data = new SlashCommandBuilder()
  .setName('leave')
  .setDescription('Leave the voice channel')
  .setDMPermission(false);

export async function execute(interaction) {
  stopListening(interaction.guildId);
  const left = leaveVoice(interaction.guildId);
  await interaction.reply({
    content: left ? 'Left the voice channel.' : 'I am not in a voice channel.',
    flags: MessageFlags.Ephemeral,
  });
}

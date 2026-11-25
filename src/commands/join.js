import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { ensureInChannel, getCallerVoiceChannel, missingVoicePermissions } from '../lib/voice.js';

export const data = new SlashCommandBuilder()
  .setName('join')
  .setDescription('Join your voice channel')
  .setDMPermission(false);

export async function execute(interaction) {
  const located = getCallerVoiceChannel(interaction);
  if (located.error) {
    await interaction.reply({ content: located.error, flags: MessageFlags.Ephemeral });
    return;
  }

  const me = await interaction.guild.members.fetchMe();
  const permissionError = missingVoicePermissions(located.channel, me);
  if (permissionError) {
    await interaction.reply({ content: permissionError, flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    await ensureInChannel(located.channel);
    await interaction.editReply(`Joined ${located.channel}.`);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && (error.message.startsWith('I am ') || error.message.startsWith('Timed out'))
      ? error.message
      : 'I could not connect to that voice channel.';
    await interaction.editReply(message);
  }
}

import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { formatSound, getSounds } from '../lib/soundboard.js';

const CHUNK_SIZE = 1900;

/**
 * @param {string} text
 */
function chunkLines(text) {
  const chunks = [];
  let current = '';
  for (const line of text.split('\n')) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > CHUNK_SIZE) {
      if (current) chunks.push(current);
      current = line.slice(0, CHUNK_SIZE);
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/**
 * @param {import('discord.js').SoundboardSound[]} sounds
 */
function listSection(title, sounds) {
  const lines = sounds.length
    ? sounds.map((sound) => formatSound(sound))
    : ['(none)'];
  return `**${title}**\n${lines.join('\n')}`;
}

export const data = new SlashCommandBuilder()
  .setName('sounds')
  .setDescription('List default and server soundboard sounds')
  .setDMPermission(false);

export async function execute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const { defaults, guildSounds } = await getSounds(interaction.guild);
  const text = [
    listSection('Default', defaults),
    '',
    listSection('This server', guildSounds),
    '',
    'Use one of these names with /play.',
  ].join('\n');

  const [first, ...rest] = chunkLines(text);
  await interaction.editReply(first);
  for (const part of rest) {
    await interaction.followUp({ content: part, flags: MessageFlags.Ephemeral });
  }
}

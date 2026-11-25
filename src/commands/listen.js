import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { startListening } from '../lib/listen.js';
import { resolveSound } from '../lib/soundboard.js';
import { preloadTranscriber } from '../lib/transcribe.js';
import { getTriggers } from '../lib/triggers.js';
import { ensureInChannel, getCallerVoiceChannel, missingVoicePermissions, voiceStateBlock } from '../lib/voice.js';

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
  return chunks.length ? chunks : ['Listening.'];
}

export const data = new SlashCommandBuilder()
  .setName('listen')
  .setDescription('Listen for configured phrases and play their sounds')
  .setDMPermission(false);

export async function execute(interaction) {
  const triggers = getTriggers();
  if (triggers.length === 0) {
    await interaction.reply({
      content: 'Add at least one phrase to triggers.json and restart the bot.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

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
    const refreshed = await interaction.guild.members.fetchMe();
    const blocked = voiceStateBlock(refreshed);
    if (blocked) {
      await interaction.editReply(blocked);
      return;
    }

    await interaction.editReply('Loading speech recognition. The first run downloads the Whisper model.');
    await preloadTranscriber();
    startListening(located.channel);
  } catch (error) {
    console.error(error);
    const message = error instanceof Error && (error.message.startsWith('I am ') || error.message.startsWith('Timed out') || error.message.startsWith('I am not'))
      ? error.message
      : 'I could not start listening.';
    await interaction.editReply(message);
    return;
  }

  const lines = ['Listening. I only transcribe while this is on.', ''];
  for (const trigger of triggers) {
    const resolved = await resolveSound(interaction.guild, trigger.sound, trigger.source);
    if (resolved.error) {
      lines.push(`"${trigger.phrase}" -> ${trigger.sound}: ${resolved.error}`);
    } else {
      const where = trigger.source === 'default' ? ' (default)' : '';
      lines.push(`"${trigger.phrase}" -> ${resolved.sound.name}${where}`);
    }
  }

  const [first, ...rest] = chunkLines(lines.join('\n'));
  await interaction.editReply(first);
  for (const part of rest) {
    await interaction.followUp({ content: part, flags: MessageFlags.Ephemeral });
  }
}

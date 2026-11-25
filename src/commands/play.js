import { DiscordAPIError } from '@discordjs/rest';
import { MessageFlags, SlashCommandBuilder } from 'discord.js';
import { resolveSound, searchSounds, sendSoundboardSound, toAutocompleteChoices } from '../lib/soundboard.js';
import {
  ensureInChannel,
  getCallerVoiceChannel,
  missingVoicePermissions,
  voiceStateBlock,
} from '../lib/voice.js';

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play a Discord soundboard sound in your voice channel')
  .setDMPermission(false)
  .addStringOption((option) =>
    option
      .setName('sound')
      .setDescription('Sound name')
      .setRequired(true)
      .setAutocomplete(true),
  );

export async function autocomplete(interaction) {
  if (!interaction.guild) {
    await interaction.respond([]);
    return;
  }
  const focused = interaction.options.getFocused();
  const matches = await searchSounds(interaction.guild, focused);
  await interaction.respond(toAutocompleteChoices(matches));
}

/**
 * @param {unknown} error
 */
function playErrorMessage(error) {
  if (error instanceof DiscordAPIError && (error.code === 50013 || error.code === 50001)) {
    return 'I need Speak and Use Soundboard in that channel. Sounds from another server also need Use External Sounds.';
  }
  if (error instanceof Error && (error.message.startsWith('I am ') || error.message.startsWith('Timed out'))) {
    return error.message;
  }
  if (error instanceof Error && error.name === 'AbortError') {
    return 'I could not connect to that voice channel.';
  }
  return 'I could not play that sound.';
}

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

  const raw = interaction.options.getString('sound', true);
  const resolved = await resolveSound(interaction.guild, raw);
  if (resolved.error) {
    await interaction.editReply(resolved.error);
    return;
  }

  try {
    await ensureInChannel(located.channel);
    const refreshed = await interaction.guild.members.fetchMe();
    const blocked = voiceStateBlock(refreshed);
    if (blocked) {
      await interaction.editReply(blocked);
      return;
    }

    await sendSoundboardSound(located.channel, resolved);
    await interaction.editReply(`Played ${resolved.sound.name}.`);
  } catch (error) {
    console.error(error);
    await interaction.editReply(playErrorMessage(error));
  }
}

import {
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  VoiceConnectionStatus,
} from '@discordjs/voice';
import { ChannelType, PermissionFlagsBits } from 'discord.js';

const READY_TIMEOUT_MS = 15_000;

/**
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export function getCallerVoiceChannel(interaction) {
  const channel = interaction.member?.voice?.channel ?? null;
  if (!channel) {
    return { error: 'Join a voice channel first.' };
  }
  if (channel.type !== ChannelType.GuildVoice) {
    return { error: 'Soundboard only works in a voice channel, not a stage channel.' };
  }
  return { channel };
}

/**
 * @param {import('discord.js').GuildVoiceChannel} channel
 * @param {import('discord.js').GuildMember} me
 */
export function missingVoicePermissions(channel, me) {
  const perms = channel.permissionsFor(me);
  if (!perms) return `I cannot see ${channel}.`;

  const required = [
    [PermissionFlagsBits.ViewChannel, 'View Channel'],
    [PermissionFlagsBits.Connect, 'Connect'],
    [PermissionFlagsBits.Speak, 'Speak'],
    [PermissionFlagsBits.UseSoundboard, 'Use Soundboard'],
  ];
  const missing = required.filter(([flag]) => !perms.has(flag)).map(([, name]) => name);
  if (missing.length === 0) return null;
  return `I need ${missing.join(', ')} in ${channel}.`;
}

/**
 * @param {import('discord.js').GuildMember} me
 */
export function voiceStateBlock(me) {
  const voice = me.voice;
  if (!voice) return null;
  if (voice.serverDeaf || voice.selfDeaf) return 'I am deafened, so Discord will not play a soundboard sound.';
  if (voice.serverMute || voice.selfMute) return 'I am muted, so Discord will not play a soundboard sound.';
  if (voice.suppress) return 'I am suppressed in this channel, so Discord will not play a soundboard sound.';
  return null;
}

/**
 * Discord updates the guild voice state separately from the voice websocket.
 * Soundboard send checks that state, so wait until it shows the bot in `channel`
 * and not muted, deafened, or suppressed.
 * @param {import('discord.js').GuildVoiceChannel} channel
 */
function waitUntilListedInChannel(channel) {
  const botId = channel.client.user.id;

  return new Promise((resolve, reject) => {
    let settled = false;

    const finish = (settle) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.client.off('voiceStateUpdate', onUpdate);
      settle();
    };

    const inspect = () => {
      const state = channel.guild.voiceStates.cache.get(botId);
      if (state?.channelId !== channel.id) return;
      const blocked = voiceStateBlock({ voice: state });
      if (blocked) {
        finish(() => reject(new Error(blocked)));
        return;
      }
      finish(resolve);
    };

    const onUpdate = () => inspect();
    const timer = setTimeout(() => {
      finish(() => reject(new Error('Timed out waiting to appear in the voice channel.')));
    }, READY_TIMEOUT_MS);

    channel.client.on('voiceStateUpdate', onUpdate);
    inspect();
  });
}

/**
 * Join `channel` if needed and wait until the connection is Ready.
 * Joining a different channel in the same guild moves the existing connection.
 * @param {import('discord.js').GuildVoiceChannel} channel
 */
export async function ensureInChannel(channel) {
  const existing = getVoiceConnection(channel.guildId);
  const sameChannel = existing?.joinConfig.channelId === channel.id
    && existing.state.status !== VoiceConnectionStatus.Destroyed;

  let connection = existing;
  if (!sameChannel) {
    connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guildId,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: false,
      selfMute: false,
    });
  }

  try {
    if (connection.state.status !== VoiceConnectionStatus.Ready) {
      await entersState(connection, VoiceConnectionStatus.Ready, READY_TIMEOUT_MS);
    }
    await waitUntilListedInChannel(channel);
    return connection;
  } catch (error) {
    if (!sameChannel) connection.destroy();
    throw error;
  }
}

/**
 * @param {string} guildId
 */
export function leaveVoice(guildId) {
  const connection = getVoiceConnection(guildId);
  if (!connection) return false;
  connection.destroy();
  return true;
}

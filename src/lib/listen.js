import { EndBehaviorType, getVoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { ChannelType } from 'discord.js';
import prism from 'prism-media';
import { resolveSound, sendSoundboardSound } from './soundboard.js';
import { transcribe } from './transcribe.js';
import { matchTrigger, normalizePhrase } from './triggers.js';

const SILENCE_MS = 700;
const MAX_MS = 4_000;
const MIN_MS = 300;
const COOLDOWN_MS = 2_000;
const DISCORD_RATE = 48_000;
const CHANNELS = 2;
const BYTES_PER_FRAME = CHANNELS * 2;

/** @type {Map<string, Session>} */
const sessions = new Map();

/**
 * @typedef {object} Session
 * @property {boolean} active
 * @property {import('discord.js').Guild} guild
 * @property {import('@discordjs/voice').VoiceConnection} connection
 * @property {Set<string>} capturing
 * @property {Set<import('stream').Readable>} streams
 * @property {Promise<void>} queue
 * @property {number} cooldownUntil
 * @property {(userId: string) => void} onStart
 * @property {(oldState: unknown, newState: { status: string }) => void} onState
 */

/**
 * @param {string} guildId
 */
export function isListening(guildId) {
  return sessions.has(guildId);
}

/**
 * @param {string} guildId
 */
export function stopListening(guildId) {
  const session = sessions.get(guildId);
  if (!session) return false;
  sessions.delete(guildId);
  session.active = false;
  session.connection.receiver.speaking.off('start', session.onStart);
  session.connection.off('stateChange', session.onState);
  for (const stream of session.streams) stream.destroy();
  session.streams.clear();
  session.capturing.clear();
  return true;
}

/**
 * @param {import('discord.js').GuildVoiceChannel} channel
 */
export function startListening(channel) {
  const connection = getVoiceConnection(channel.guildId);
  if (!connection || connection.state.status === VoiceConnectionStatus.Destroyed) {
    throw new Error('I am not connected to that voice channel.');
  }

  stopListening(channel.guildId);

  /** @type {Session} */
  const session = {
    active: true,
    guild: channel.guild,
    connection,
    capturing: new Set(),
    streams: new Set(),
    queue: Promise.resolve(),
    cooldownUntil: 0,
    onStart: () => {},
    onState: () => {},
  };

  session.onStart = (userId) => {
    if (!session.active) return;
    if (userId === channel.client.user?.id) return;
    if (session.capturing.has(userId)) return;
    if (Date.now() < session.cooldownUntil) return;
    captureUser(session, userId);
  };

  session.onState = (_oldState, newState) => {
    if (newState.status === VoiceConnectionStatus.Destroyed) stopListening(channel.guildId);
  };

  sessions.set(channel.guildId, session);
  connection.receiver.speaking.on('start', session.onStart);
  connection.on('stateChange', session.onState);
}

/**
 * @param {Session} session
 * @param {string} userId
 */
function captureUser(session, userId) {
  session.capturing.add(userId);

  const opusStream = session.connection.receiver.subscribe(userId, {
    end: {
      behavior: EndBehaviorType.AfterSilence,
      duration: SILENCE_MS,
    },
  });
  session.streams.add(opusStream);

  const decoder = new prism.opus.Decoder({
    rate: DISCORD_RATE,
    channels: CHANNELS,
    frameSize: 960,
    writableObjectMode: true,
  });

  /** @type {Buffer[]} */
  const chunks = [];
  let bytes = 0;
  const maxBytes = DISCORD_RATE * BYTES_PER_FRAME * (MAX_MS / 1000);
  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    session.capturing.delete(userId);
    session.streams.delete(opusStream);
    if (!opusStream.destroyed) opusStream.destroy();
    if (!decoder.destroyed) decoder.destroy();

    if (!session.active) return;
    const pcm = Buffer.concat(chunks);
    const durationMs = (pcm.length / (DISCORD_RATE * BYTES_PER_FRAME)) * 1000;
    if (durationMs < MIN_MS) return;

    session.queue = session.queue
      .then(() => processClip(session, pcm))
      .catch((error) => console.error(error));
  };

  const timer = setTimeout(finish, MAX_MS);

  opusStream.on('data', (packet) => {
    if (finished) return;
    try {
      decoder.write(packet);
    } catch (error) {
      console.error(error);
      finish();
    }
  });
  decoder.on('data', (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    if (bytes >= maxBytes) return;
    const remaining = maxBytes - bytes;
    const slice = buffer.length > remaining ? buffer.subarray(0, remaining) : buffer;
    chunks.push(slice);
    bytes += slice.length;
  });
  opusStream.on('end', finish);
  opusStream.on('close', finish);
  opusStream.on('error', (error) => {
    console.error(error);
    finish();
  });
  decoder.on('error', (error) => {
    console.error(error);
    finish();
  });
}

/**
 * Stereo 48kHz s16le to mono 16kHz float32.
 * @param {Buffer} pcm
 */
function toWhisperAudio(pcm) {
  const frames = Math.floor(pcm.length / BYTES_PER_FRAME);
  const out = new Float32Array(Math.floor(frames / 3));
  for (let i = 0; i < out.length; i++) {
    const base = i * 3;
    let sum = 0;
    for (let offset = 0; offset < 3; offset++) {
      const index = (base + offset) * BYTES_PER_FRAME;
      const left = pcm.readInt16LE(index);
      const right = pcm.readInt16LE(index + 2);
      sum += (left + right) / 2 / 32768;
    }
    out[i] = sum / 3;
  }
  return out;
}

/**
 * @param {import('discord.js').Guild} guild
 */
function playbackChannel(guild) {
  const state = guild.voiceStates.cache.get(guild.client.user.id);
  const channel = state?.channel ?? null;
  if (!channel || channel.type !== ChannelType.GuildVoice) return null;
  return channel;
}

/**
 * @param {Session} session
 * @param {Buffer} pcm
 */
async function processClip(session, pcm) {
  if (!session.active || Date.now() < session.cooldownUntil) return;

  const text = await transcribe(toWhisperAudio(pcm));
  const normalized = normalizePhrase(text);
  console.log(`Heard ${JSON.stringify(text)} (${JSON.stringify(normalized)})`);
  if (!session.active || Date.now() < session.cooldownUntil) return;

  const trigger = matchTrigger(text);
  if (!trigger) return;

  const channel = playbackChannel(session.guild);
  if (!channel) return;

  const resolved = await resolveSound(session.guild, trigger.sound, trigger.source);
  if (resolved.error) {
    console.error(`Phrase "${trigger.phrase}": ${resolved.error}`);
    return;
  }

  await sendSoundboardSound(channel, resolved);
  session.cooldownUntil = Date.now() + COOLDOWN_MS;
  console.log(`Played ${resolved.sound.name} for phrase "${trigger.phrase}"`);
}

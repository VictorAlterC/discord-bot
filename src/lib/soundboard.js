const CACHE_MS = 60_000;

/** @type {Map<string, { at: number, defaults: import('discord.js').SoundboardSound[], guildSounds: import('discord.js').SoundboardSound[] }>} */
const cache = new Map();

/**
 * @param {'default' | 'guild'} kind
 * @param {string} soundId
 */
export function encodeSound(kind, soundId) {
  return `${kind}:${soundId}`;
}

/**
 * @param {string} value
 * @returns {{ kind: 'default' | 'guild', soundId: string } | null}
 */
export function decodeSound(value) {
  const separator = value.indexOf(':');
  if (separator === -1) return null;
  const kind = value.slice(0, separator);
  const soundId = value.slice(separator + 1);
  if ((kind !== 'default' && kind !== 'guild') || !soundId) return null;
  return { kind, soundId };
}

/**
 * @param {import('discord.js').SoundboardSound} sound
 */
export function formatSound(sound) {
  const emoji = sound.emoji;
  let prefix = '';
  if (typeof emoji === 'string') {
    prefix = emoji;
  } else if (emoji) {
    prefix = emoji.toString();
  }
  return prefix ? `${prefix} ${sound.name}` : sound.name;
}

/**
 * @param {import('discord.js').Guild} guild
 */
export async function getSounds(guild) {
  const hit = cache.get(guild.id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;

  const [defaults, guildSounds] = await Promise.all([
    guild.client.fetchDefaultSoundboardSounds(),
    guild.soundboardSounds.fetch(),
  ]);

  const entry = {
    at: Date.now(),
    defaults: [...defaults.values()].filter((sound) => sound.available !== false),
    guildSounds: [...guildSounds.values()].filter((sound) => sound.available !== false),
  };
  cache.set(guild.id, entry);
  return entry;
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} query
 */
export async function searchSounds(guild, query) {
  const { defaults, guildSounds } = await getSounds(guild);
  const needle = query.trim().toLowerCase();
  const all = [
    ...guildSounds.map((sound) => ({ kind: /** @type {const} */ ('guild'), sound })),
    ...defaults.map((sound) => ({ kind: /** @type {const} */ ('default'), sound })),
  ];
  const filtered = needle
    ? all.filter(({ sound }) => sound.name.toLowerCase().includes(needle))
    : all;
  return filtered.slice(0, 25);
}

/**
 * @param {import('discord.js').GuildVoiceChannel} channel
 * @param {{ kind: 'default' | 'guild', sound: { soundId: string } }} resolved
 */
export async function sendSoundboardSound(channel, resolved) {
  const { kind, sound } = resolved;
  await channel.sendSoundboardSound(
    kind === 'guild'
      ? { soundId: sound.soundId, guildId: channel.guildId }
      : { soundId: sound.soundId },
  );
}

/**
 * @param {import('discord.js').Guild} guild
 * @param {string} raw
 * @param {'default' | 'guild'} [source]
 */
export async function resolveSound(guild, raw, source) {
  const decoded = source ? null : decodeSound(raw);
  const { defaults, guildSounds } = await getSounds(guild);

  if (source === 'guild' || source === 'default') {
    const list = source === 'guild' ? guildSounds : defaults;
    const needle = raw.trim().toLowerCase();
    const matches = list.filter((sound) => sound.name.toLowerCase() === needle);
    if (matches.length === 1) return { kind: source, sound: matches[0] };
    if (matches.length > 1) {
      return { error: `Several ${source} sounds share the name "${raw.trim()}".` };
    }
    return { error: `No ${source} sound named "${raw.trim()}".` };
  }

  if (decoded) {
    const list = decoded.kind === 'guild' ? guildSounds : defaults;
    const sound = list.find((entry) => String(entry.soundId) === decoded.soundId);
    if (!sound || sound.available === false) {
      return { error: 'That sound is no longer available.' };
    }
    return { kind: decoded.kind, sound };
  }

  const needle = raw.trim().toLowerCase();
  const guildMatches = guildSounds.filter((sound) => sound.name.toLowerCase() === needle);
  const defaultMatches = defaults.filter((sound) => sound.name.toLowerCase() === needle);

  if (guildMatches.length === 1) return { kind: 'guild', sound: guildMatches[0] };
  if (guildMatches.length > 1) {
    return { error: 'Several server sounds share that name. Pick one from the suggestions.' };
  }
  if (defaultMatches.length === 1) return { kind: 'default', sound: defaultMatches[0] };
  if (defaultMatches.length > 1) {
    return { error: 'Several default sounds share that name. Pick one from the suggestions.' };
  }
  return { error: `No sound named "${raw.trim()}". Use /sounds to see names.` };
}

/**
 * @param {{ kind: 'default' | 'guild', sound: { soundId: string } }[]} matches
 */
export function toAutocompleteChoices(matches) {
  const used = new Set();
  return matches.map(({ kind, sound }) => {
    const suffix = kind === 'default' ? ' (default)' : '';
    let name = `${formatSound(sound)}${suffix}`.slice(0, 100);
    if (used.has(name)) {
      const idSuffix = ` (${sound.soundId})`;
      name = `${name.slice(0, 100 - idSuffix.length)}${idSuffix}`;
    }
    used.add(name);
    return {
      name,
      value: encodeSound(kind, String(sound.soundId)),
    };
  });
}

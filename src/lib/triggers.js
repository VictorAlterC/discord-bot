import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const triggersPath = join(dirname(fileURLToPath(import.meta.url)), '../../triggers.json');

/** @type {{ phrase: string, sound: string, source?: 'default' | 'guild' }[] | null} */
let triggers = null;

/**
 * Lowercase, trim, and strip punctuation so a transcript can be compared to a configured phrase.
 * @param {string} text
 */
export function normalizePhrase(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {unknown} raw
 */
export function parseTriggers(raw) {
  if (!Array.isArray(raw)) {
    throw new Error('triggers.json must be an array.');
  }

  /** @type {{ phrase: string, sound: string, source?: 'default' | 'guild' }[]} */
  const loaded = [];
  const seen = new Set();

  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Each trigger must be an object with phrase and sound.');
    }
    const record = /** @type {{ phrase?: unknown, sound?: unknown, source?: unknown }} */ (entry);
    if (typeof record.phrase !== 'string' || typeof record.sound !== 'string') {
      throw new Error('Each trigger needs a phrase and a sound name.');
    }
    const phrase = normalizePhrase(record.phrase);
    if (!phrase) {
      throw new Error(`Empty phrase in triggers.json (from "${record.phrase}").`);
    }
    const sound = record.sound.trim();
    if (!sound) {
      throw new Error(`Empty sound for phrase "${phrase}".`);
    }
    if (record.source !== undefined && record.source !== 'default' && record.source !== 'guild') {
      throw new Error(`Invalid source for phrase "${phrase}". Use "default" or "guild".`);
    }
    if (seen.has(phrase)) {
      throw new Error(`Duplicate phrase "${phrase}" in triggers.json.`);
    }
    seen.add(phrase);
    loaded.push({
      phrase,
      sound,
      ...(record.source === 'default' || record.source === 'guild' ? { source: record.source } : {}),
    });
  }

  return loaded;
}

export function loadTriggers() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(triggersPath, 'utf8'));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read triggers.json: ${message}`);
  }
  triggers = parseTriggers(raw);
  return triggers;
}

export function getTriggers() {
  if (!triggers) return loadTriggers();
  return triggers;
}

/**
 * @param {string[]} words
 * @param {string[]} phraseWords
 */
function containsPhrase(words, phraseWords) {
  if (phraseWords.length === 0 || phraseWords.length > words.length) return false;
  for (let i = 0; i <= words.length - phraseWords.length; i++) {
    if (phraseWords.every((word, offset) => words[i + offset] === word)) return true;
  }
  return false;
}

/**
 * Match a configured phrase as whole words inside the transcript.
 * When several phrases match, the longest one wins.
 * @param {string} transcript
 */
export function matchTrigger(transcript) {
  const normalized = normalizePhrase(transcript);
  if (!normalized) return null;
  const words = normalized.split(' ');
  let best = null;
  let bestLength = 0;
  for (const trigger of getTriggers()) {
    const phraseWords = trigger.phrase.split(' ');
    if (phraseWords.length <= bestLength) continue;
    if (!containsPhrase(words, phraseWords)) continue;
    best = trigger;
    bestLength = phraseWords.length;
  }
  return best;
}

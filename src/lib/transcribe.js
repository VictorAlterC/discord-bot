import { env, pipeline } from '@huggingface/transformers';
import { join } from 'node:path';

env.cacheDir = join(process.cwd(), '.cache', 'huggingface');

const MODEL = 'Xenova/whisper-tiny';

/** @type {Promise<import('@huggingface/transformers').AutomaticSpeechRecognitionPipeline> | null} */
let transcriberPromise = null;

export function preloadTranscriber() {
  transcriberPromise ??= pipeline('automatic-speech-recognition', MODEL);
  return transcriberPromise;
}

/**
 * @param {Float32Array} audio 16kHz mono PCM in the range -1 to 1
 */
export async function transcribe(audio) {
  const transcriber = await preloadTranscriber();
  const result = await transcriber(audio, {
    task: 'transcribe',
    language: 'es',
    return_timestamps: false,
  });
  const text = Array.isArray(result) ? result.map((part) => part.text).join(' ') : result.text;
  return text ?? '';
}

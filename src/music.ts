/**
 * What a music model can do, read from the input schema on its card, and
 * the job input a request becomes for that model. Only fields the schema
 * lists are sent: a field it does not list is refused.
 */
import type { ModelCard } from '@hearthscale/app';

interface Field {
  type?: string | string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
  enum?: unknown[];
  description?: string;
  format?: string;
  contentMediaType?: string;
}

export interface MusicSchema {
  properties: Record<string, Field>;
  required?: string[];
}

export function musicSchema(card: ModelCard): MusicSchema | null {
  const input = card.jobs?.music?.input as MusicSchema | undefined;
  return input?.properties ? input : null;
}

export interface Length {
  min: number;
  max: number;
  start: number;
}

export interface Abilities {
  /** The model takes lyrics, so it sings. */
  sings: boolean;
  /** The range of lengths the model takes, where it takes a length. */
  length: Length | null;
  seed: boolean;
  /** The model's own field for the tempo, where it has one. */
  tempoField: string | null;
  /** The model's own field for the key, where it has one. */
  keyField: string | null;
}

/** The length a new piece starts at, in seconds: short, so the first result comes fast. */
const FIRST_LENGTH = 30;

const TEMPO_FIELD = /^(bpm|tempo)$/i;
const KEY_FIELD = /^(key|keyscale|keyScale|musicalKey)$/;

export function abilities(schema: MusicSchema): Abilities {
  const props = schema.properties;
  const seconds = props.seconds;
  const length = seconds
    ? {
        min: Math.max(1, Math.ceil(seconds.minimum ?? 1)),
        max: Math.floor(seconds.maximum ?? 300),
        start: Math.min(Math.floor(seconds.maximum ?? 300), FIRST_LENGTH),
      }
    : null;
  const names = Object.keys(props);
  return {
    sings: 'lyrics' in props,
    length,
    seed: 'seed' in props,
    tempoField: names.find((name) => TEMPO_FIELD.test(name) && isNumber(props[name]!)) ?? null,
    keyField: names.find((name) => KEY_FIELD.test(name) && props[name]!.type === 'string') ?? null,
  };
}

function isNumber(field: Field): boolean {
  const types = Array.isArray(field.type) ? field.type : [field.type];
  return types.includes('number') || types.includes('integer');
}

interface SongRequest {
  words: string;
  styles: string[];
  seconds: number | null;
  instrumental: boolean;
  lyrics: string;
  tempo: number | null;
  key: string | null;
  seed: number | null;
}

/** The lyrics a singing model reads as a piece with no singing. */
const NO_SINGING = '[instrumental]';

export function songInput(schema: MusicSchema, request: SongRequest): Record<string, unknown> {
  const can = abilities(schema);
  const prompt = [request.words.trim(), ...request.styles];
  const input: Record<string, unknown> = {};
  if (request.tempo !== null) {
    if (can.tempoField) input[can.tempoField] = request.tempo;
    else prompt.push(`${request.tempo} bpm`);
  }
  if (request.key !== null) {
    if (can.keyField) input[can.keyField] = request.key;
    else prompt.push(request.key);
  }
  input.prompt = prompt.filter(Boolean).join(', ');
  if (can.length && request.seconds !== null) input.seconds = request.seconds;
  if (can.sings && request.instrumental) input.lyrics = NO_SINGING;
  else if (can.sings && request.lyrics.trim()) input.lyrics = request.lyrics;
  if (can.seed && request.seed !== null) input.seed = request.seed;
  return input;
}

/** A seed in the range every model's schema takes. */
export function newSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]!;
}

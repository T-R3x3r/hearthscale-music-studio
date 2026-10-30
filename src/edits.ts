/**
 * The edits a music model makes to audio, read from its schema. Music
 * models name their modes in fields of their own; these are the field names
 * the developer documentation gives for them (jobs.md, "Make music"): a
 * `route` enum with `cover`, `repaint`, `lego` and `complete`, or an
 * `audioInputKind` enum with `init_audio` and `inpaint_audio`. A model that
 * names neither, or lacks a field an edit needs, offers no such edit.
 */
import type { MusicSchema } from './music';

export interface Edits {
  /** Fields that make the source again in the style of the prompt; `change` is 0 (close) to 1 (far). */
  restyle?: (change: number) => Record<string, unknown>;
  /** Fields that make the stretch from `start` to `end`, in seconds of the source, again. */
  repaint?: (start: number, end: number) => Record<string, unknown>;
  /** Fields that add one instrument's part to the source. */
  addPart?: (part: string) => Record<string, unknown>;
}

/** The parts a model that adds parts knows by name, in plain words. */
export const PARTS = ['drums', 'bass', 'guitar', 'keyboard', 'strings', 'synth', 'percussion', 'brass', 'woodwinds', 'vocals'];

export function editsOf(schema: MusicSchema): Edits {
  const props = schema.properties;
  if (!props.audio) return {};
  const route = props.route?.enum as string[] | undefined;
  if (route) {
    return {
      ...(route.includes('cover') && props.audioCoverStrength
        ? { restyle: (change: number) => ({ route: 'cover', audioCoverStrength: round(1 - 0.9 * change) }) }
        : {}),
      ...(route.includes('repaint') && props.repaintingStart && props.repaintingEnd
        ? { repaint: (start: number, end: number) => ({ route: 'repaint', repaintingStart: round(start), repaintingEnd: round(end) }) }
        : {}),
      ...(route.includes('lego') && props.trackName ? { addPart: (part: string) => ({ route: 'lego', trackName: part }) } : {}),
    };
  }
  const kind = props.audioInputKind?.enum as string[] | undefined;
  if (kind) {
    return {
      ...(kind.includes('init_audio') && props.initNoiseLevel
        ? { restyle: (change: number) => ({ audioInputKind: 'init_audio', initNoiseLevel: round(0.2 + 0.7 * change) }) }
        : {}),
      ...(kind.includes('inpaint_audio') && props.inpaintMaskStartSec && props.inpaintMaskEndSec
        ? {
            repaint: (start: number, end: number) => ({
              audioInputKind: 'inpaint_audio',
              inpaintMaskStartSec: String(round(start)),
              inpaintMaskEndSec: String(round(end)),
            }),
          }
        : {}),
    };
  }
  return {};
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

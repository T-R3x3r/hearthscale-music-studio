/**
 * A song's lyrics as sections, such as a verse and a chorus, the text a
 * singing model reads from them, and the chat model that writes them.
 */
import { complete } from './bridge';

export const SECTIONS = ['Intro', 'Verse', 'Pre-chorus', 'Chorus', 'Bridge', 'Outro'] as const;
export type SectionName = (typeof SECTIONS)[number];

export interface LyricSection {
  id: string;
  name: SectionName;
  text: string;
}

/** The lyrics as a singing model reads them: each section tag on its own line, its words on the lines after it. */
export function lyricsText(sections: LyricSection[]): string {
  return sections
    .filter((s) => s.text.trim())
    .map((s) => `[${s.name.toLowerCase()}]\n${s.text.trim()}`)
    .join('\n\n');
}

const WRITER = `You write song lyrics for a person who describes a song.
Write short, singable lines that rhyme where it sounds natural.
Answer only with the JSON the format asks for.`;

const SHAPE = {
  name: 'lyrics',
  schema: {
    type: 'object',
    properties: {
      sections: {
        type: 'array',
        minItems: 2,
        maxItems: 8,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', enum: [...SECTIONS] },
            lines: { type: 'array', minItems: 1, maxItems: 8, items: { type: 'string' } },
          },
          required: ['name', 'lines'],
        },
      },
    },
    required: ['sections'],
  },
};

/** Lyrics the chat model writes for a song described in words. */
export async function writeLyrics(about: string): Promise<LyricSection[]> {
  const answer = await complete({
    messages: [
      { role: 'system', content: WRITER },
      { role: 'user', content: `Write lyrics with a verse and a chorus for this song: ${about}` },
    ],
    format: SHAPE,
    reasoning: 'none',
  });
  const parsed = JSON.parse(answer) as { sections: { name: SectionName; lines: string[] }[] };
  return parsed.sections.map((s) => ({ id: crypto.randomUUID(), name: s.name, text: s.lines.join('\n') }));
}

/** One section written again by the chat model, in the song's other words. */
export async function rewriteSection(about: string, section: LyricSection, all: LyricSection[]): Promise<string> {
  const answer = await complete({
    messages: [
      { role: 'system', content: `${WRITER.split('\n')[0]}\nAnswer with the new lines only, one line each, nothing else.` },
      {
        role: 'user',
        content: `The song: ${about}\n\nIts lyrics:\n${lyricsText(all)}\n\nWrite the ${section.name.toLowerCase()} "${section.text.split('\n')[0]}" again, with new lines of about the same length.`,
      },
    ],
    reasoning: 'none',
  });
  return answer
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('['))
    .join('\n');
}

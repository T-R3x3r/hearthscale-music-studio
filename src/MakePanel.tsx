import { useState } from 'react';
import { Button, Chip, Icon, Label, Notice, Slider, Toggle, useFloatingTips } from '@hearthscale/app-ui';
import type { ModelCard } from '@hearthscale/app';
import type { MusicModel } from './models';
import type { LyricSection } from './lyrics';
import { LyricsEditor } from './LyricsEditor';
import { abilities, musicSchema, type Abilities } from './music';

const STYLES = [
  'pop', 'rock', 'hip hop', 'electronic', 'lo-fi', 'jazz', 'classical', 'folk', 'ambient', 'funk',
  'happy', 'calm', 'sad', 'epic', 'dreamy', 'dark',
  'piano', 'guitar', 'drums', 'strings', 'synth', 'bass',
];

export interface MakeRequest {
  card: ModelCard;
  words: string;
  styles: string[];
  seconds: number | null;
  instrumental: boolean;
}

interface Props {
  /** The music model requests run on, or why none runs. */
  model: MusicModel;
  onMake: (request: MakeRequest) => void;
  lyrics: LyricSection[];
  onLyrics: (sections: LyricSection[]) => void;
}

export function MakePanel({ model, onMake, lyrics, onLyrics }: Props) {
  const { card } = model;
  const [words, setWords] = useState('');
  const [styles, setStyles] = useState<string[]>([]);
  const [instrumental, setInstrumental] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [writing, setWriting] = useState(false);
  const tips = useFloatingTips('top');

  const schema = card ? musicSchema(card) : null;
  const can: Abilities | null = schema ? abilities(schema) : null;
  const length = can?.length ? Math.min(can.length.max, Math.max(can.length.min, seconds ?? can.length.start)) : null;
  const ready = card !== null && can !== null && (words.trim() !== '' || styles.length > 0);

  if (!card) return <NoModel reason={model.reason ?? 'No music model runs.'} />;

  const flip = (style: string) =>
    setStyles((now) => (now.includes(style) ? now.filter((s) => s !== style) : [...now, style]));

  const blocked = schema === null ? 'This model makes no music from words.' : undefined;
  const make = tips('make', ready ? undefined : blocked ?? 'Describe the music first.');

  return (
    <div className="ms-make">
      {writing && can?.sings && !instrumental && (
        <LyricsEditor about={[words, ...styles].join(', ')} sections={lyrics} onChange={onLyrics} />
      )}
      <textarea
        className="ms-words hs-ta"
        aria-label="Describe the music"
        placeholder="Describe the music"
        value={words}
        rows={2}
        onChange={(event) => setWords(event.target.value)}
      />
      <div className="ms-chips">
        {STYLES.map((style) => (
          <Chip key={style} selected={styles.includes(style)} onClick={() => flip(style)}>
            {style}
          </Chip>
        ))}
      </div>
      <div className="ms-make-row">
        {length !== null && can?.length && (
          <div className="ms-length">
            <Label>Length</Label>
            <Slider
              label="Length"
              min={can.length.min}
              max={can.length.max}
              step={1}
              value={length}
              onChange={setSeconds}
              shown={`${length} s`}
            />
          </div>
        )}
        {can?.sings && (
          <label className="ms-switch">
            <Toggle checked={instrumental} onChange={setInstrumental} aria-label="Instrumental" />
            Instrumental
          </label>
        )}
        {can?.sings && !instrumental && (
          <Button variant={writing ? 'secondary' : 'ghost'} icon={<Icon name="quill-pen-line" size={14} />} onClick={() => setWriting((w) => !w)}>
            Lyrics
          </Button>
        )}
        <span className="hs-tipwrap ms-go" {...make.hover}>
          <Button
            variant="primary"
            icon={<Icon name="music-ai-line" size={14} />}
            disabled={!ready}
            onClick={() => onMake({ card, words, styles, seconds: length, instrumental })}
          >
            Make
          </Button>
          {make.tip}
        </span>
      </div>
    </div>
  );
}

/** What the panel shows when no music model runs: why. */
function NoModel({ reason }: { reason: string }) {
  return (
    <div className="ms-make">
      <Notice>{reason}</Notice>
    </div>
  );
}

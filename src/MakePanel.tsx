import { useRef, useState } from 'react';
import { Button, Chip, Icon, IconButton, Label, Meter, Notice, Popover, SettingsSelect, Slider, Toggle, useFloatingTips } from '@hearthscale/app-ui';
import type { ModelCard } from '@hearthscale/app';
import { onboarding } from '../app.json';
import { reason } from './bridge';
import { sentenceCase } from './text';
import type { MusicModels } from './models';
import type { LyricSection } from './lyrics';
import { LyricsEditor } from './LyricsEditor';
import { abilities, musicSchema, type Abilities } from './music';

/** The music model the introduction downloads, by the id its Server lists it under. */
const FIRST_MODEL = onboarding.cards.find((card) => 'download' in card)?.download;

const STYLES = [
  'pop', 'rock', 'hip hop', 'electronic', 'lo-fi', 'jazz', 'classical', 'folk', 'ambient', 'funk',
  'happy', 'calm', 'sad', 'cinematic', 'dreamy', 'dark',
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
  models: MusicModels;
  /** The music model requests run on. */
  card: ModelCard | null;
  onPick: (card: string) => void;
  onMake: (request: MakeRequest) => void;
  lyrics: LyricSection[];
  onLyrics: (sections: LyricSection[]) => void;
}

export function MakePanel({ models, card, onPick, onMake, lyrics, onLyrics }: Props) {
  const [words, setWords] = useState('');
  const [styles, setStyles] = useState<string[]>([]);
  const [instrumental, setInstrumental] = useState(false);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [showMore, setShowMore] = useState(false);
  const [writing, setWriting] = useState(false);
  const more = useRef<HTMLSpanElement>(null);
  const tips = useFloatingTips('top');

  const schema = card ? musicSchema(card) : null;
  const can: Abilities | null = schema ? abilities(schema) : null;
  const length = can?.length ? Math.min(can.length.max, Math.max(can.length.min, seconds ?? can.length.start)) : null;
  const ready = card !== null && can !== null && (words.trim() !== '' || styles.length > 0);

  if (!card) return <NoModel models={models} />;

  const flip = (style: string) =>
    setStyles((now) => (now.includes(style) ? now.filter((s) => s !== style) : [...now, style]));

  const blocked = schema === null ? 'This model cannot make music from a description.' : undefined;
  const make = tips('make', ready ? undefined : blocked ?? 'Describe the music first.');

  return (
    <div className="ms-make">
      {writing && can?.sings && !instrumental && (
        <LyricsEditor about={[words, ...styles].join(', ')} sections={lyrics} onChange={onLyrics} />
      )}
      <textarea
        className="ms-words hs-ta"
        aria-label="Description"
        placeholder="Warm lo-fi beat with soft piano and rain"
        value={words}
        rows={2}
        onChange={(event) => setWords(event.target.value)}
      />
      <div className="ms-chips">
        {STYLES.map((style) => (
          <Chip key={style} selected={styles.includes(style)} onClick={() => flip(style)}>
            {sentenceCase(style)}
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
          <Button
            variant={writing ? 'secondary' : 'ghost'}
            aria-pressed={writing}
            icon={<Icon name="quill-pen-line" size={14} />}
            onClick={() => setWriting((w) => !w)}
          >
            Lyrics
          </Button>
        )}
        <div className="ms-go">
          <SettingsSelect
            label="Music model"
            value={card.id}
            options={models.ready.map((c) => ({ value: c.id, label: c.label }))}
            onPick={onPick}
            minWidth={200}
          />
          {models.offered.length > 0 && (
            <span ref={more}>
              <IconButton aria-label="Add a music model" onClick={() => setShowMore(true)}>
                <Icon name="add-circle-line" size={16} />
              </IconButton>
            </span>
          )}
          {showMore && more.current && (
            <Popover anchor={more.current} placement="top-end" label="Add a music model" onDismiss={() => setShowMore(false)}>
              <div className="ms-more-models">
                <Installs models={models} cards={models.offered} />
              </div>
            </Popover>
          )}
          <span className="hs-tipwrap" {...make.hover}>
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
    </div>
  );
}

/** What the panel shows with no music model: the download the introduction offers, or why none can run. */
function NoModel({ models }: { models: MusicModels }) {
  const first = models.offered.find((card) => card.id.endsWith(`/${FIRST_MODEL}`));
  if (!first) {
    return (
      <div className="ms-make">
        <div>
          <Notice>{models.failure ?? models.chosen.reason ?? 'No music model can run on this computer.'}</Notice>
        </div>
      </div>
    );
  }
  return (
    <div className="ms-make">
      <span className="ms-strong">Music studio needs a music model.</span>
      <Installs models={models} cards={[first]} />
    </div>
  );
}

/** Music models a Server offers, each with Download or its download under way. */
function Installs({ models, cards }: { models: MusicModels; cards: ModelCard[] }) {
  const [failure, setFailure] = useState<string | null>(null);
  const install = async (card: string) => {
    try {
      setFailure(null);
      await models.install(card);
    } catch (error) {
      setFailure(reason(error));
    }
  };
  return (
    <>
      {failure && <Notice>{failure}</Notice>}
      <div className="ms-installs">
        {cards.map((card) => {
          const download = models.downloads[card.id];
          const share = download?.progress ? download.progress.receivedBytes / Math.max(1, download.progress.totalBytes) : null;
          return (
            <div key={card.id} className="ms-installs">
              {download?.state !== 'downloading' && download?.reason && <Notice>{download.reason}</Notice>}
              <div className="ms-install">
                <span className="ms-install-name">{card.label}</span>
                {card.sizeBytes !== undefined && <span className="ms-dim">{gigabytes(card.sizeBytes)}</span>}
                {download?.state === 'downloading' ? (
                  <div className="ms-install-meter">
                    <Meter value={share ?? 0} label={`Downloading ${card.label}`} />
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" icon={<Icon name="download-2-line" size={14} />} onClick={() => void install(card.id)}>
                    {download?.reason ? 'Try again' : 'Download'}
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function gigabytes(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`;
}

import { useRef, useState } from 'react';
import { Button, Chip, Icon, IconButton, Label, Meter, Notice, Popover, SettingsSelect, Slider, Toggle, useFloatingTips } from '@hearthscale/app-ui';
import type { ModelCard } from '@hearthscale/app';
import { reason } from './bridge';
import type { MusicModels } from './models';
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
              <IconButton aria-label="More music models" onClick={() => setShowMore(true)}>
                <Icon name="add-circle-line" size={16} />
              </IconButton>
            </span>
          )}
          {showMore && more.current && (
            <Popover anchor={more.current} placement="top-end" label="More music models" onDismiss={() => setShowMore(false)}>
              <div className="ms-more-models">
                <Installs models={models} />
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

/** What the panel shows with no music model: why, and the models to install. */
function NoModel({ models }: { models: MusicModels }) {
  const tips = useFloatingTips('top');
  const why = models.failure ?? models.chosen.reason ?? 'No music model can run on this computer.';
  const whyTip = tips('why', why);
  return (
    <div className="ms-make ms-nomodel">
      <div className="ms-nomodel-head">
        <Icon name="music-ai-line" size={18} />
        <span className="ms-strong">Get a music model</span>
        <span className="hs-tipwrap ms-why" {...whyTip.hover}>
          <Icon name="question-line" size={14} />
          {whyTip.tip}
        </span>
      </div>
      <Installs models={models} />
    </div>
  );
}

/** The music models a Server offers, each with Install or its download. */
function Installs({ models }: { models: MusicModels }) {
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
        {models.offered.map((card) => {
          const download = models.downloads[card.id];
          const share = download?.progress ? download.progress.receivedBytes / Math.max(1, download.progress.totalBytes) : null;
          return (
            <div key={card.id} className="ms-install">
              <span className="ms-install-name">{card.label}</span>
              {card.sizeBytes !== undefined && <span className="ms-dim">{gigabytes(card.sizeBytes)}</span>}
              {download?.state === 'downloading' ? (
                <div className="ms-install-meter">
                  <Meter value={share ?? 0} label={`Downloading ${card.label}`} />
                </div>
              ) : (
                <Button size="sm" variant="secondary" icon={<Icon name="download-2-line" size={14} />} onClick={() => void install(card.id)}>
                  Install
                </Button>
              )}
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

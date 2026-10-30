import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from 'react';
import {
  anchorFrom,
  Button,
  Icon,
  IconButton,
  MDivider,
  MenuSurface,
  MItem,
  Slider,
  StatusWord,
  useFloatingTips,
  type IconName,
  type MenuAnchor,
} from '@hearthscale/app-ui';
import { TipIconButton } from './TipIconButton';
import type { Job } from '@hearthscale/app';
import { audible, PEAKS_PER_SECOND, peaks, type Engine } from './audio';
import { onLookChange } from './bridge';
import {
  changeTrack,
  clipOf,
  cutAt,
  duplicate,
  moveClip,
  removeClip,
  removeTrack,
  setLoops,
  snapBeat,
  toggleFade,
  trimEnd,
  trimStart,
} from './edit';
import type { Edits } from './edits';
import { EDITS, type EditKind } from './EditPanel';
import { clipSeconds, clipStart, newId, secondsPerBeat, songSeconds, SOUNDS, withVersion, type Clip, type Song, type Sound, type Track } from './song';

/** Seconds the timeline runs past the song's end. */
const TAIL = 30;

/** Pixels the pointer moves before a press on a clip becomes a drag. */
const DRAG_START = 3;

/** The data type a snippet carries while it is dragged. */
export const SNIPPET_DRAG = 'application/x-music-studio-snippet';

type Edit = (song: Song) => Song;

const SOUND_ICONS: Record<Sound, IconName> = { warm: 'sun-line', bright: 'contrast-2-line', space: 'expand-diagonal-line' };

export interface Range {
  from: number;
  to: number;
}

interface Props {
  song: Song;
  engine: Engine;
  position: number;
  pixelsPerSecond: number;
  jobs: Record<string, Job>;
  selected: string | null;
  onSelect: (clip: string | null) => void;
  onSeek: (seconds: number) => void;
  onEdit: (edit: Edit) => void;
  onKeep: (clip: string) => void;
  onRetry: (clip: string) => void;
  onSnippet: (clip: string) => void;
  onSplit: (clip: string) => void;
  onDropSnippet: (snippet: string, track: string | null, beat: number) => void;
  /** The bars the person chose on the ruler, in seconds of the song. */
  range: Range | null;
  onRange: (range: Range | null) => void;
  /** The edits the chosen music model makes. */
  edits: Edits;
  onEditStart: (kind: EditKind, clip: string) => void;
}

type Grip = 'move' | 'start' | 'end' | 'loop';

interface Drag {
  clip: string;
  grip: Grip;
  x: number;
  moved: boolean;
}

export function Timeline(props: Props) {
  const { song, position, pixelsPerSecond: pps, selected, onSelect, onSeek, onEdit, onDropSnippet, range, onRange } = props;
  const [sweep, setSweep] = useState<{ from: number; to: number; x: number } | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [draft, setDraft] = useState<{ edit: Edit; song: Song } | null>(null);
  const lanes = useRef<HTMLDivElement>(null);
  const shown = draft?.song ?? song;
  const seconds = songSeconds(shown) + TAIL;
  const bar = secondsPerBeat(shown) * shown.beatsPerBar;
  const bars = Math.ceil(seconds / bar);

  const secondsAt = (clientX: number) => {
    const box = lanes.current!.getBoundingClientRect();
    return Math.max(0, (clientX - box.left) / pps);
  };

  const trackAt = (clientX: number, clientY: number) =>
    (document.elementFromPoint(clientX, clientY)?.closest('[data-track]') as HTMLElement | null)?.dataset.track ?? null;

  const press = (event: PointerEvent<HTMLElement>, clip: string, grip: Grip) => {
    // A menu drawn in a portal passes its presses up through the clip's React tree.
    if (event.button !== 0 || !event.currentTarget.contains(event.target as Node)) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    onSelect(clip);
    setDrag({ clip, grip, x: event.clientX, moved: false });
  };

  const move = (event: PointerEvent<HTMLElement>) => {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    if (!drag.moved && Math.abs(dx) < DRAG_START) return;
    const clip = clipOf(song, drag.clip);
    if (!clip) return;
    const beats = dx / pps / secondsPerBeat(song);
    const fine = event.shiftKey;
    let edit: Edit;
    if (drag.grip === 'move') {
      const track = trackAt(event.clientX, event.clientY) ?? song.tracks.find((t) => t.clips.includes(clip))!.id;
      const beat = snapBeat(song, clip.startBeat + beats, fine);
      edit = (s) => moveClip(s, drag.clip, track, beat);
    } else if (drag.grip === 'start') {
      const beat = snapBeat(song, clip.startBeat + beats, fine);
      edit = (s) => trimStart(s, drag.clip, beat);
    } else {
      const end = clip.startBeat + clipSeconds(clip) / secondsPerBeat(song);
      const until = snapBeat(song, end + beats, fine);
      const span = (until - clip.startBeat) * secondsPerBeat(song);
      edit = drag.grip === 'end' ? (s) => trimEnd(s, drag.clip, span) : (s) => setLoops(s, drag.clip, span / clip.length);
    }
    setDrag({ ...drag, moved: true });
    setDraft({ edit, song: edit(song) });
  };

  const release = () => {
    if (draft) onEdit(draft.edit);
    setDraft(null);
    setDrag(null);
  };

  const toBar = (seconds: number, fine: boolean) => snapBeat(song, seconds / secondsPerBeat(song), fine) * secondsPerBeat(song);

  const sweepStart = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const at = toBar(secondsAt(event.clientX), event.shiftKey);
    setSweep({ from: at, to: at, x: event.clientX });
  };

  const sweepMove = (event: PointerEvent<HTMLDivElement>) => {
    if (sweep) setSweep({ ...sweep, to: toBar(secondsAt(event.clientX), event.shiftKey) });
  };

  const sweepEnd = (event: PointerEvent<HTMLDivElement>) => {
    if (!sweep) return;
    setSweep(null);
    if (Math.abs(event.clientX - sweep.x) < DRAG_START || sweep.from === sweep.to) {
      onRange(null);
      onSelect(null);
      onSeek(secondsAt(event.clientX));
      return;
    }
    onRange({ from: Math.min(sweep.from, sweep.to), to: Math.max(sweep.from, sweep.to) });
  };

  const shownRange = sweep ? { from: Math.min(sweep.from, sweep.to), to: Math.max(sweep.from, sweep.to) } : range;

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    onSelect(null);
    onSeek(secondsAt(event.clientX));
  };

  const dropSnippet = (event: DragEvent<HTMLDivElement>, track: string | null) => {
    const snippet = event.dataTransfer.getData(SNIPPET_DRAG);
    if (!snippet) return;
    event.preventDefault();
    event.stopPropagation();
    onDropSnippet(snippet, track, snapBeat(song, secondsAt(event.clientX) / secondsPerBeat(song), event.shiftKey));
  };

  const allowSnippet = (event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer.types.includes(SNIPPET_DRAG)) event.preventDefault();
  };

  return (
    <div className="ms-timeline">
      <div className="ms-lane-heads">
        <div className="ms-ruler-head" />
        {shown.tracks.map((track) => (
          <TrackHead key={track.id} track={track} onEdit={onEdit} />
        ))}
      </div>
      <div className="ms-lanes-scroll">
        <div
          ref={lanes}
          className="ms-lanes"
          style={{ width: seconds * pps }}
          onPointerMove={move}
          onPointerUp={release}
          onPointerCancel={release}
          onDragOver={allowSnippet}
          onDrop={(event) => dropSnippet(event, null)}
        >
          <div className="ms-ruler" onPointerDown={sweepStart} onPointerMove={sweepMove} onPointerUp={sweepEnd}>
            {Array.from({ length: bars }, (_, i) => (
              <span key={i} className="ms-bar ms-num" style={{ left: i * bar * pps }}>
                {i + 1}
              </span>
            ))}
          </div>
          {shown.tracks.map((track) => (
            <div
              key={track.id}
              className="ms-lane"
              data-swatch={track.swatch}
              data-silent={!audible(shown, track) || undefined}
              data-track={track.id}
              onClick={seek}
              onDragOver={allowSnippet}
              onDrop={(event) => dropSnippet(event, track.id)}
            >
              {track.clips.map((clip) => (
                <ClipBlock key={clip.id} {...props} song={shown} clip={clip} pps={pps} picked={clip.id === selected} onPress={press} />
              ))}
            </div>
          ))}
          {shownRange && <div className="ms-range" style={{ left: shownRange.from * pps, width: (shownRange.to - shownRange.from) * pps }} />}
          <div className="ms-playhead" style={{ left: position * pps }} />
        </div>
      </div>
    </div>
  );
}

function TrackHead({ track, onEdit }: { track: Track; onEdit: (edit: Edit) => void }) {
  const tips = useFloatingTips('top');
  const muteTip = tips('mute', 'Mute this track');
  const soloTip = tips('solo', 'Hear only this track');
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const set = (change: Partial<Omit<Track, 'id' | 'clips'>>) => onEdit((s) => changeTrack(s, track.id, change));
  return (
    <div className="ms-lane-head" data-swatch={track.swatch}>
      <div className="ms-lane-title">
        <span className="hs-swatch-dot" />
        <input
          className="ms-lane-name"
          aria-label="Track name"
          value={track.name}
          onChange={(event) => set({ name: event.target.value })}
        />
        <TipIconButton size="sm" aria-label="Track menu" onClick={(event) => setMenu(anchorFrom('track', event))}>
          <Icon name="more-2-line" size={14} />
        </TipIconButton>
      </div>
      <div className="ms-lane-controls">
        <span className="hs-tipwrap" {...muteTip.hover}>
          <IconButton className="ms-switch-button ms-letter" aria-pressed={track.muted} aria-label="Mute" onClick={() => set({ muted: !track.muted })}>
            M
          </IconButton>
          {muteTip.tip}
        </span>
        <span className="hs-tipwrap" {...soloTip.hover}>
          <IconButton className="ms-switch-button ms-letter" aria-pressed={track.solo} aria-label="Solo" onClick={() => set({ solo: !track.solo })}>
            S
          </IconButton>
          {soloTip.tip}
        </span>
        <div className="ms-lane-volume">
          <Slider label="Volume" min={0} max={1.5} step={0.05} value={track.volume} onChange={(volume) => set({ volume })} />
        </div>
      </div>
      {menu && (
        <MenuSurface anchor={menu} onDismiss={() => setMenu(null)}>
          <MItem icon={<Icon name="arrow-left-line" size={14} />} label="Pan left" checked={track.pan < 0} onClick={() => set({ pan: -0.6 })} />
          <MItem icon={<Icon name="focus-3-line" size={14} />} label="Pan centre" checked={track.pan === 0} onClick={() => set({ pan: 0 })} />
          <MItem icon={<Icon name="arrow-right-line" size={14} />} label="Pan right" checked={track.pan > 0} onClick={() => set({ pan: 0.6 })} />
          <MDivider />
          {(Object.keys(SOUNDS) as Sound[]).map((sound) => (
            <MItem
              key={sound}
              icon={<Icon name={SOUND_ICONS[sound]} size={14} />}
              label={SOUNDS[sound]}
              checked={track.sound === sound}
              onClick={() => set({ sound: track.sound === sound ? null : sound })}
            />
          ))}
          <MDivider />
          <MItem
            icon={<Icon name="delete-bin-line" size={14} />}
            label="Delete track"
            danger
            onClick={() => {
              setMenu(null);
              onEdit((s) => removeTrack(s, track.id));
            }}
          />
        </MenuSurface>
      )}
    </div>
  );
}

interface ClipProps extends Props {
  clip: Clip;
  pps: number;
  picked: boolean;
  onPress: (event: PointerEvent<HTMLElement>, clip: string, grip: Grip) => void;
}

function ClipBlock({ song, clip, engine, jobs, pps, picked, position, edits, onPress, onEdit, onKeep, onRetry, onSnippet, onSplit, onSelect, onEditStart }: ClipProps) {
  const tips = useFloatingTips('top');
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [menuKeys, setMenuKeys] = useState(false);
  const point = useRef<HTMLSpanElement>(null);
  const left = clipStart(song, clip) * pps;
  const take = song.takes[clip.take];
  const waiting = song.pending.filter((p) => p.clip === clip.id && !p.split);
  const splitting = song.pending.some((p) => p.clip === clip.id && p.split);
  const width = clipSeconds(clip) * pps;
  const stop = (event: MouseEvent) => event.stopPropagation();

  if (!take) {
    const job = waiting.map((p) => jobs[p.job]).find(Boolean);
    const hold = tips('hold', job?.waiting ?? clip.failure);
    return (
      <div className="ms-clip ms-clip-waiting" style={{ left, width }} onClick={stop}>
        <div className="ms-clip-bar">
          <span className="ms-clip-name">{clip.ask?.words ?? waiting[0]?.words}</span>
          <span className="hs-tipwrap" {...hold.hover}>
            {waiting.length > 0 ? (
              <StatusWord tone="info" live>
                Making…
              </StatusWord>
            ) : (
              <StatusWord tone="bad">Failed</StatusWord>
            )}
            {hold.tip}
          </span>
          {waiting.length === 0 && (
            <span className="ms-versions">
              {clip.ask && (
                <TipIconButton size="sm" aria-label="Try again" onClick={() => onRetry(clip.id)}>
                  <Icon name="refresh-line" size={14} />
                </TipIconButton>
              )}
              <TipIconButton size="sm" aria-label="Remove clip" onClick={() => onEdit((s) => removeClip(s, clip.id))}>
                <Icon name="close-line" size={14} />
              </TipIconButton>
            </span>
          )}
        </div>
      </div>
    );
  }

  const index = clip.versions.indexOf(clip.take);
  const takes = tips('takes', 'Other takes. Keep the one you like.');
  const loopTip = tips('loop', 'Drag to repeat the clip');
  const total = Math.max(clip.versions.length, clip.expected);
  const step = (by: number) => {
    const next = clip.versions[(index + by + clip.versions.length) % clip.versions.length];
    if (next) onEdit((s) => withVersion(s, clip.id, next));
  };
  const start = clipStart(song, clip);
  const inside = position > start && position < start + clip.length && clip.loops === 1;
  const begin = (kind: EditKind) => {
    setMenu(null);
    onEditStart(kind, clip.id);
  };
  const act = (edit: (s: Song) => Song) => {
    setMenu(null);
    onEdit(edit);
  };
  /** Opens the clip's menu at the pointer, on a right-click. */
  const openAtPointer = (event: MouseEvent<HTMLElement>) => {
    event.preventDefault();
    const box = event.currentTarget.getBoundingClientRect();
    const at = point.current!;
    at.style.left = `${event.clientX - box.left}px`;
    at.style.top = `${event.clientY - box.top}px`;
    onSelect(clip.id);
    setMenuKeys(false);
    setMenu({ key: 'clip', element: at });
  };
  /** Picks the clip on Enter, and opens its menu on Shift+F10 or the menu key. */
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      onSelect(clip.id);
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault();
      onSelect(clip.id);
      setMenuKeys(true);
      setMenu({ key: 'clip', element: event.currentTarget });
    }
  };

  return (
    <div
      className="ms-clip"
      tabIndex={0}
      aria-label={take.words || 'Audio'}
      data-picked={picked || undefined}
      style={{ left, width }}
      onClick={stop}
      onPointerDown={(event) => onPress(event, clip.id, 'move')}
      onContextMenu={openAtPointer}
      onKeyDown={onKey}
    >
      <span ref={point} className="ms-menu-point" />
      <Wave
        asset={take.asset}
        offset={clip.offset}
        length={clip.length}
        loops={clip.loops}
        engine={engine}
        played={Math.min(width, Math.max(0, (position - start) * pps))}
      />
      {Array.from({ length: clip.loops - 1 }, (_, i) => (
        <span key={i} className="ms-notch" style={{ left: (i + 1) * clip.length * pps }} />
      ))}
      {clip.fadeIn > 0 && <span className="ms-fade ms-fade-in" style={{ width: clip.fadeIn * pps }} />}
      {clip.fadeOut > 0 && <span className="ms-fade ms-fade-out" style={{ width: clip.fadeOut * pps }} />}
      <div className="ms-clip-bar">
        <span className="ms-clip-name">{take.words || 'Audio'}</span>
        <span className="ms-clip-actions">
          {splitting && (
            <StatusWord tone="info" live>
              Splitting…
            </StatusWord>
          )}
          {waiting.length > 0 && (
            <StatusWord tone="info" live>
              Making…
            </StatusWord>
          )}
          {clip.versions.length > 0 && (
            <span className="ms-versions" onPointerDown={(event) => event.stopPropagation()}>
              <TipIconButton size="sm" aria-label="Previous take" onClick={() => step(-1)}>
                <Icon name="arrow-left-s-line" size={14} />
              </TipIconButton>
              <span className="hs-tipwrap ms-num" {...takes.hover}>
                {index + 1} / {total}
                {takes.tip}
              </span>
              <TipIconButton size="sm" aria-label="Next take" onClick={() => step(1)}>
                <Icon name="arrow-right-s-line" size={14} />
              </TipIconButton>
              {waiting.length === 0 && (
                <Button size="sm" variant="secondary" onClick={() => onKeep(clip.id)}>
                  Keep
                </Button>
              )}
            </span>
          )}
          {picked && (
            <span onPointerDown={(event) => event.stopPropagation()}>
              <TipIconButton
                size="sm"
                aria-label="Clip menu"
                onClick={(event) => {
                  setMenuKeys(false);
                  setMenu(anchorFrom('clip', event));
                }}
              >
                <Icon name="more-2-line" size={14} />
              </TipIconButton>
            </span>
          )}
        </span>
      </div>
      {clip.loops === 1 && <span className="ms-grip ms-grip-start" onPointerDown={(event) => onPress(event, clip.id, 'start')} />}
      {clip.loops === 1 && <span className="ms-grip ms-grip-end" onPointerDown={(event) => onPress(event, clip.id, 'end')} />}
      <span className="ms-grip ms-grip-loop" aria-label="Loop" onPointerDown={(event) => onPress(event, clip.id, 'loop')} {...loopTip.hover}>
        <Icon name="repeat-2-line" size={12} />
        {loopTip.tip}
      </span>
      {menu && (
        <MenuSurface anchor={menu} keyboard={menuKeys} onDismiss={() => setMenu(null)}>
          {edits.restyle && <MItem icon={<Icon name={EDITS.restyle.icon} size={14} />} label={EDITS.restyle.title} onClick={() => begin('restyle')} />}
          {edits.repaint && <MItem icon={<Icon name={EDITS.repaint.icon} size={14} />} label={EDITS.repaint.title} onClick={() => begin('repaint')} />}
          {edits.repaint && <MItem icon={<Icon name={EDITS.longer.icon} size={14} />} label={EDITS.longer.title} onClick={() => begin('longer')} />}
          {edits.addPart && <MItem icon={<Icon name={EDITS.add.icon} size={14} />} label={EDITS.add.title} onClick={() => begin('add')} />}
          {(edits.restyle || edits.repaint || edits.addPart) && <MDivider />}
          <MItem icon={<Icon name="scissors-cut-line" size={14} />} label="Cut at playhead" disabled={!inside} onClick={() => act((s) => cutAt(s, clip.id, position))} />
          <MItem
            icon={<Icon name="file-copy-line" size={14} />}
            label="Duplicate"
            onClick={() => {
              const copy = newId();
              act((s) => duplicate(s, clip.id, copy));
              onSelect(copy);
            }}
          />
          <MItem icon={<Icon name="repeat-2-line" size={14} />} label="Loop once more" onClick={() => act((s) => setLoops(s, clip.id, clip.loops + 1))} />
          <MItem icon={<Icon name="contrast-drop-line" size={14} />} label="Fade in" checked={clip.fadeIn > 0} onClick={() => act((s) => toggleFade(s, clip.id, 'in'))} />
          <MItem icon={<Icon name="contrast-drop-2-line" size={14} />} label="Fade out" checked={clip.fadeOut > 0} onClick={() => act((s) => toggleFade(s, clip.id, 'out'))} />
          <MItem
            icon={<Icon name="git-branch-line" size={14} />}
            label="Split into stems"
            disabled={splitting}
            onClick={() => {
              setMenu(null);
              onSplit(clip.id);
            }}
          />
          <MDivider />
          <MItem
            icon={<Icon name="bookmark-line" size={14} />}
            label="Save as snippet"
            onClick={() => {
              setMenu(null);
              onSnippet(clip.id);
            }}
          />
          <MItem icon={<Icon name="delete-bin-line" size={14} />} label="Delete" danger onClick={() => act((s) => removeClip(s, clip.id))} />
        </MenuSurface>
      )}
    </div>
  );
}

const peakCache = new Map<string, Promise<Float32Array>>();

function peaksOf(engine: Engine, asset: string): Promise<Float32Array> {
  let found = peakCache.get(asset);
  if (!found) {
    found = engine.buffer(asset).then(peaks);
    found.catch(() => peakCache.delete(asset));
    peakCache.set(asset, found);
  }
  return found;
}

interface WaveProps {
  asset: string;
  offset: number;
  length: number;
  loops: number;
  engine: Engine;
  /** How far into the clip the playhead is, in pixels. */
  played: number;
}

function Wave({ asset, offset, length, loops, engine, played }: WaveProps) {
  const base = useRef<HTMLCanvasElement>(null);
  const done = useRef<HTMLCanvasElement>(null);
  const look = useLook();
  useEffect(() => {
    let live = true;
    void peaksOf(engine, asset).then((points) => {
      if (!live) return;
      for (const element of [base.current, done.current]) if (element) paint(element, points, offset, length, loops);
    });
    return () => {
      live = false;
    };
  }, [asset, offset, length, loops, engine, look]);
  return (
    <div className="ms-wave">
      <canvas ref={base} />
      <canvas ref={done} className="ms-wave-played" style={{ clipPath: `inset(0 calc(100% - ${played}px) 0 0)` }} />
    </div>
  );
}

/** Draws the peaks of a clip across the canvas, in the canvas's own text colour. */
function paint(element: HTMLCanvasElement, points: Float32Array, offset: number, length: number, loops: number) {
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.round(element.clientWidth * scale));
  const height = Math.max(1, Math.round(element.clientHeight * scale));
  element.width = width;
  element.height = height;
  const draw = element.getContext('2d');
  if (!draw) return;
  draw.fillStyle = getComputedStyle(element).color;
  const middle = height / 2;
  const span = length * loops;
  const at = (x: number) => Math.floor((offset + (((x / width) * span) % length)) * PEAKS_PER_SECOND);
  for (let x = 0; x < width; x++) {
    const from = at(x);
    const to = Math.max(from + 1, at(x + 1));
    let level = 0;
    for (let i = from; i < to && i < points.length; i++) level = Math.max(level, points[i]!);
    const reach = Math.max(scale, level * middle);
    draw.fillRect(x, middle - reach, 1, reach * 2);
  }
}

/** A count that grows with each change of the host's look, so a canvas that read its tokens draws again. */
function useLook(): number {
  const [look, setLook] = useState(0);
  useEffect(() => onLookChange(() => requestAnimationFrame(() => setLook((n) => n + 1))), []);
  return look;
}

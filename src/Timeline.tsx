import { useEffect, useRef, type MouseEvent } from 'react';
import { Button, Icon, IconButton, StatusWord, useFloatingTips } from '@hearthscale/app-ui';
import type { Job } from '@hearthscale/app';
import { PEAKS_PER_SECOND, peaks, type Engine } from './audio';
import { clipSeconds, clipStart, secondsPerBeat, songSeconds, type Clip, type Song } from './song';

/** Pixels the timeline gives one second. */
const PIXELS_PER_SECOND = 24;

/** Seconds the timeline runs past the song's end. */
const TAIL = 30;

interface Props {
  song: Song;
  engine: Engine;
  position: number;
  jobs: Record<string, Job>;
  onSeek: (seconds: number) => void;
  onVersion: (clip: string, take: string) => void;
  onKeep: (clip: string) => void;
  onRemove: (clip: string) => void;
  onRetry: (clip: string) => void;
}

export function Timeline({ song, engine, position, jobs, onSeek, onVersion, onKeep, onRemove, onRetry }: Props) {
  const seconds = songSeconds(song) + TAIL;
  const width = seconds * PIXELS_PER_SECOND;
  const bar = secondsPerBeat(song) * song.beatsPerBar;
  const bars = Math.ceil(seconds / bar);

  const seek = (event: MouseEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, (event.clientX - box.left) / PIXELS_PER_SECOND));
  };

  return (
    <div className="ms-timeline">
      <div className="ms-lane-heads">
        <div className="ms-ruler-head" />
        {song.tracks.map((track) => (
          <div key={track.id} className="ms-lane-head" data-swatch={track.swatch}>
            <span className="hs-swatch-dot" />
            <span className="ms-lane-name">{track.name}</span>
          </div>
        ))}
      </div>
      <div className="ms-lanes-scroll">
        <div className="ms-lanes" style={{ width }}>
          <div className="ms-ruler" onClick={seek}>
            {Array.from({ length: bars }, (_, i) => (
              <span key={i} className="ms-bar" style={{ left: i * bar * PIXELS_PER_SECOND }}>
                {i + 1}
              </span>
            ))}
          </div>
          {song.tracks.map((track) => (
            <div key={track.id} className="ms-lane" data-swatch={track.swatch} onClick={seek}>
              {track.clips.map((clip) => (
                <ClipBlock
                  key={clip.id}
                  song={song}
                  clip={clip}
                  engine={engine}
                  jobs={jobs}
                  onVersion={onVersion}
                  onKeep={onKeep}
                  onRemove={onRemove}
                  onRetry={onRetry}
                />
              ))}
            </div>
          ))}
          <div className="ms-playhead" style={{ left: position * PIXELS_PER_SECOND }} />
        </div>
      </div>
    </div>
  );
}

interface ClipProps {
  song: Song;
  clip: Clip;
  engine: Engine;
  jobs: Record<string, Job>;
  onVersion: (clip: string, take: string) => void;
  onKeep: (clip: string) => void;
  onRemove: (clip: string) => void;
  onRetry: (clip: string) => void;
}

function ClipBlock({ song, clip, engine, jobs, onVersion, onKeep, onRemove, onRetry }: ClipProps) {
  const tips = useFloatingTips('top');
  const left = clipStart(song, clip) * PIXELS_PER_SECOND;
  const take = song.takes[clip.take];
  const waiting = song.pending.filter((p) => p.clip === clip.id);
  const width = clipSeconds(clip) * PIXELS_PER_SECOND;
  const stop = (event: MouseEvent) => event.stopPropagation();

  if (!take) {
    const job = waiting.map((p) => jobs[p.job]).find(Boolean);
    const why = job?.waiting ?? clip.failure;
    const hold = tips('hold', why);
    return (
      <div className="ms-clip ms-clip-waiting" style={{ left, width }} onClick={stop}>
        <span className="hs-tipwrap" {...hold.hover}>
          {waiting.length > 0 ? (
            <StatusWord tone="info" live>
              Making
            </StatusWord>
          ) : (
            <StatusWord tone="bad">Not made</StatusWord>
          )}
          {hold.tip}
        </span>
        {waiting.length === 0 && (
          <span className="ms-versions">
            {clip.ask && (
              <Button size="sm" variant="secondary" icon={<Icon name="refresh-line" size={14} />} onClick={() => onRetry(clip.id)}>
                Try again
              </Button>
            )}
            <IconButton size="sm" aria-label="Remove" onClick={() => onRemove(clip.id)}>
              <Icon name="close-line" size={14} />
            </IconButton>
          </span>
        )}
      </div>
    );
  }

  const index = clip.versions.indexOf(clip.take);
  const total = Math.max(clip.versions.length, clip.expected);
  const step = (by: number) => {
    const next = clip.versions[(index + by + clip.versions.length) % clip.versions.length];
    if (next) onVersion(clip.id, next);
  };

  return (
    <div className="ms-clip" style={{ left, width }} onClick={stop}>
      <Wave asset={take.asset} offset={clip.offset} length={clip.length} engine={engine} />
      <div className="ms-clip-bar">
        <span className="ms-clip-name">{take.words || 'Audio'}</span>
        {clip.versions.length > 0 && (
          <span className="ms-versions">
            <IconButton size="sm" aria-label="Previous version" onClick={() => step(-1)}>
              <Icon name="arrow-left-s-line" size={14} />
            </IconButton>
            <span className="ms-mono">
              {index + 1} / {total}
            </span>
            <IconButton size="sm" aria-label="Next version" onClick={() => step(1)}>
              <Icon name="arrow-right-s-line" size={14} />
            </IconButton>
            {waiting.length === 0 && (
              <Button size="sm" variant="secondary" onClick={() => onKeep(clip.id)}>
                Keep
              </Button>
            )}
          </span>
        )}
      </div>
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

function Wave({ asset, offset, length, engine }: { asset: string; offset: number; length: number; engine: Engine }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let live = true;
    void peaksOf(engine, asset).then((points) => {
      const element = canvas.current;
      if (!live || !element) return;
      const scale = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(element.clientWidth * scale));
      const height = Math.max(1, Math.round(element.clientHeight * scale));
      element.width = width;
      element.height = height;
      const draw = element.getContext('2d');
      if (!draw) return;
      draw.fillStyle = getComputedStyle(element).color;
      const middle = height / 2;
      for (let x = 0; x < width; x++) {
        const from = Math.floor((offset + (x / width) * length) * PEAKS_PER_SECOND);
        const to = Math.max(from + 1, Math.floor((offset + ((x + 1) / width) * length) * PEAKS_PER_SECOND));
        let level = 0;
        for (let i = from; i < to && i < points.length; i++) level = Math.max(level, points[i]!);
        const reach = Math.max(scale, level * middle);
        draw.fillRect(x, middle - reach, 1, reach * 2);
      }
    });
    return () => {
      live = false;
    };
  }, [asset, offset, length, engine]);
  return <canvas ref={canvas} className="ms-wave" />;
}

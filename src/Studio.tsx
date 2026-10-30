import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Button,
  EmptyState,
  Icon,
  IconButton,
  SettingsSelect,
  ShellConfirm,
  TextInput,
  Toast,
  useFloatingTips,
} from '@hearthscale/app-ui';
import type { Job } from '@hearthscale/app';
import { findTempo } from './analyse';
import { Engine, wav } from './audio';
import { call, keepWidgetState, onNote, reason, saveFile, settings, tool, upload, widgetState } from './bridge';
import { addTrack, clipOf, duplicate, newClip, placeClip, removeClip } from './edit';
import { catchUp, isOver, settle } from './jobs';
import {
  deleteSnippet,
  deleteSong,
  listSnippets,
  listSongs,
  listVersions,
  loadSong,
  loadVersion,
  openLibrary,
  saveSnippet,
  saveSong,
  saveVersion,
  unusedAssets,
  type Snippet,
  type SongRow,
  type VersionRow,
} from './library';
import { MakePanel, type MakeRequest } from './MakePanel';
import { useMusicModels } from './models';
import { abilities, musicSchema, newSeed, songInput } from './music';
import { Snippets } from './Snippets';
import {
  clipSeconds,
  newId,
  newSong,
  newTrack,
  secondsPerBeat,
  songAssets,
  songSeconds,
  withClip,
  type Ask,
  type Pending,
  type Song,
} from './song';
import { Timeline } from './Timeline';
import { Versions } from './Versions';

const KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'].flatMap((note) => [
  `${note} major`,
  `${note} minor`,
]);

/** Time a click stays good for a request that needs one, with room to spare. */
const CLICK_WINDOW_MS = 4000;

/** The zoom steps of the timeline, in pixels a second. */
const ZOOMS = [8, 12, 16, 24, 36, 54, 80, 120];

/** The most edits undo goes back through. */
const HISTORY = 200;

interface Notice {
  text: string;
  action?: { label: string; onPress: () => void };
}

/** A song back as it was, with the audio and the jobs it has now: undo never loses a take. */
function restore(snapshot: Song, current: Song): Song {
  return { ...snapshot, takes: { ...snapshot.takes, ...current.takes }, pending: current.pending };
}

export function Studio() {
  const engine = useRef<Engine | null>(null);
  engine.current ??= new Engine();
  const models = useMusicModels();
  const [rows, setRows] = useState<SongRow[]>([]);
  const [song, setSong] = useState<Song | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [jobs, setJobs] = useState<Record<string, Job>>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [deleting, setDeleting] = useState<SongRow | null>(null);
  const [picked, setPicked] = useState<string | null>(() => localStorage.getItem('music-model'));
  const [sidebar, setSidebar] = useState(true);
  const [panel, setPanel] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [zoom, setZoom] = useState(3);
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [, setDepth] = useState(0);
  const tips = useFloatingTips('bottom');

  const songRef = useRef<Song | null>(null);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const saveTimer = useRef(0);
  const picker = useRef<HTMLInputElement>(null);
  const past = useRef<Song[]>([]);
  const future = useRef<Song[]>([]);
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selected;

  const fail = useCallback((error: unknown) => setNotice({ text: reason(error) }), []);

  const refreshRows = useCallback(async () => {
    setRows(await listSongs());
  }, []);

  const persist = useCallback(
    (next: Song) => {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(() => {
        saveSong(next).then(refreshRows, fail);
      }, 400);
    },
    [refreshRows, fail],
  );

  /** Changes the open song, one change after the other, and keeps it. */
  const change = useCallback(
    (update: (song: Song) => Song | Promise<Song>) => {
      chain.current = chain.current
        .then(async () => {
          const current = songRef.current;
          if (!current) return;
          const next = await update(current);
          if (songRef.current?.id !== current.id || next === current) return;
          songRef.current = next;
          setSong(next);
          persist(next);
        })
        .catch(fail);
      return chain.current;
    },
    [persist, fail],
  );

  /** A change the person made, which undo takes back. */
  const edit = useCallback(
    (update: (song: Song) => Song) =>
      change((current) => {
        const next = update(current);
        if (next !== current) {
          past.current = [...past.current.slice(1 - HISTORY), current];
          future.current = [];
          setDepth((d) => d + 1);
        }
        return next;
      }),
    [change],
  );

  const undo = useCallback(
    () =>
      change((current) => {
        const before = past.current.at(-1);
        if (!before) return current;
        past.current = past.current.slice(0, -1);
        future.current = [...future.current, current];
        setDepth((d) => d + 1);
        return restore(before, current);
      }),
    [change],
  );

  const redo = useCallback(
    () =>
      change((current) => {
        const after = future.current.at(-1);
        if (!after) return current;
        future.current = future.current.slice(0, -1);
        past.current = [...past.current, current];
        setDepth((d) => d + 1);
        return restore(after, current);
      }),
    [change],
  );

  /** Sets the song's tempo from its first audio, where it has none yet. */
  const withTempo = useCallback(async (s: Song): Promise<Song> => {
    if (s.tempo !== null) return s;
    const first = s.tracks.flatMap((t) => t.clips).find((c) => s.takes[c.take]);
    if (!first) return s;
    const tempo = await findTempo(await engine.current!.buffer(s.takes[first.take]!.asset));
    return tempo === null ? s : { ...s, tempo };
  }, []);

  const open = useCallback(
    async (id: string | null) => {
      engine.current!.stop();
      setPlaying(false);
      setPosition(0);
      setSelected(null);
      past.current = [];
      future.current = [];
      const found = id ? await loadSong(id) : null;
      songRef.current = found;
      setSong(found);
      setVersions(found ? await listVersions(found.id) : []);
      void keepWidgetState({ song: found?.id ?? null }).catch(fail);
      if (found && found.pending.length > 0) await change(async (s) => withTempo(await catchUp(s, engine.current!)));
    },
    [change, withTempo, fail],
  );

  useEffect(() => {
    void (async () => {
      try {
        await openLibrary();
        const list = await listSongs();
        setRows(list);
        setSnippets(await listSnippets());
        const kept = (widgetState() as { song?: string } | null)?.song;
        await open(list.find((row) => row.id === kept)?.id ?? list[0]?.id ?? null);
      } catch (error) {
        fail(error);
      } finally {
        setLoaded(true);
      }
    })();
  }, [open, fail]);

  useEffect(
    () =>
      onNote((note) => {
        if (note.method !== 'hearthscale/jobs/progress') return;
        const { job } = note.params;
        setJobs((before) => ({ ...before, [job.id]: job }));
        if (!isOver(job)) return;
        if (songRef.current?.pending.some((p) => p.job === job.id)) {
          void change(async (s) => withTempo(await settle(s, job, engine.current!)));
          return;
        }
        void settleElsewhere(job, engine.current!).then(refreshRows, fail);
      }),
    [change, withTempo, refreshRows, fail],
  );

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      setPosition(engine.current!.position());
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const ended = useCallback(() => {
    setPlaying(false);
    setPosition(0);
  }, []);

  const togglePlay = useCallback(async () => {
    const current = songRef.current;
    const sound = engine.current!;
    if (!current) return;
    if (sound.isPlaying) {
      sound.stop();
      setPlaying(false);
      setPosition(sound.position());
      return;
    }
    if (songSeconds(current) === 0) return;
    const from = sound.position() >= songSeconds(current) ? 0 : sound.position();
    try {
      await sound.play(current, from, ended);
      setPlaying(true);
    } catch (error) {
      fail(error);
    }
  }, [ended, fail]);

  useEffect(() => {
    const sound = engine.current!;
    const heard = sound.playing;
    if (!playing || !song || !heard || (song.tracks === heard.tracks && song.tempo === heard.tempo)) return;
    void sound.play(song, sound.position(), ended).catch(fail);
  }, [song, playing, ended, fail]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.closest('input, textarea, [contenteditable="true"]')) return;
      const command = event.ctrlKey || event.metaKey;
      const clip = selectedRef.current;
      if (event.code === 'Space') {
        event.preventDefault();
        void togglePlay();
      } else if (command && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        void (event.shiftKey ? redo() : undo());
      } else if (command && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        void redo();
      } else if (command && event.key.toLowerCase() === 'd' && clip) {
        event.preventDefault();
        const copy = newId();
        void edit((s) => duplicate(s, clip, copy));
        setSelected(copy);
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && clip) {
        event.preventDefault();
        void edit((s) => removeClip(s, clip));
        setSelected(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlay, undo, redo, edit]);

  const createSong = async () => {
    const created = newSong(`Song ${rows.length + 1}`);
    await saveSong(created).catch(fail);
    await refreshRows();
    await open(created.id);
  };

  /** Deletes audio that nothing kept uses any more, on the press that asked for it. */
  const forget = async (assets: string[], except: string | null, label: string) => {
    const unused = await unusedAssets(assets, except);
    if (unused.length > 0) await tool('forget_audio', { assets: unused }, label);
    for (const asset of unused) engine.current!.forget(asset);
  };

  const removeSong = async (row: SongRow) => {
    setDeleting(null);
    try {
      const doomed = row.id === songRef.current?.id ? songRef.current : await loadSong(row.id);
      if (doomed) {
        for (const pending of doomed.pending) await call('hearthscale/jobs/cancel', { id: pending.job }).catch(() => undefined);
        await forget(songAssets(doomed), doomed.id, 'Delete song');
      }
      await deleteSong(row.id);
      const list = await listSongs();
      setRows(list);
      if (row.id === songRef.current?.id) await open(list[0]?.id ?? null);
    } catch (error) {
      fail(error);
    }
  };

  /** Submits the versions a clip asks for; answers the jobs that started. */
  const submit = async (ask: Ask, clip: string): Promise<Pending[]> => {
    const pendings: Pending[] = [];
    try {
      for (let i = 0; i < ask.count; i++) {
        const seed = ask.seeded ? newSeed() : null;
        const input = seed === null ? ask.input : { ...ask.input, seed };
        const { job } = await call('hearthscale/jobs/submit', { kind: 'music', input, model: ask.model });
        setJobs((before) => ({ ...before, [job.id]: job }));
        pendings.push({ job: job.id, clip, words: ask.words, model: ask.model, ...(seed === null ? {} : { seed }) });
      }
    } catch (error) {
      fail(error);
    }
    return pendings;
  };

  const make = async (request: MakeRequest) => {
    const current = songRef.current;
    const schema = musicSchema(request.card);
    if (!current || !schema) return;
    const input = songInput(schema, {
      words: request.words,
      styles: request.styles,
      seconds: request.seconds,
      instrumental: request.instrumental,
      lyrics: '',
      tempo: current.tempo,
      key: current.key,
      seed: null,
    });
    const ask: Ask = {
      model: request.card.id,
      input,
      words: [request.words.trim(), ...request.styles].filter(Boolean).join(', '),
      seeded: abilities(schema).seed,
      count: Math.max(1, Math.min(4, Number(settings().versions ?? 1))),
    };
    const clip = { ...newClip('', 0, 0), ask, expected: ask.count };
    const pendings = await submit(ask, clip.id);
    if (pendings.length === 0) return;
    clip.expected = pendings.length;
    await edit((s) => {
      const first = s.tracks[0] ?? newTrack(s, 'Song');
      const bar = secondsPerBeat(s) * s.beatsPerBar;
      const end = first.clips.reduce((at, c) => Math.max(at, c.startBeat * secondsPerBeat(s) + clipSeconds(c)), 0);
      const placed = { ...clip, startBeat: Math.ceil(end / bar) * s.beatsPerBar };
      const tracks = s.tracks.length === 0 ? [{ ...first, clips: [placed] }] : s.tracks.map((t, i) => (i === 0 ? { ...t, clips: [...t.clips, placed] } : t));
      return { ...s, tracks, pending: [...s.pending, ...pendings] };
    });
  };

  /** Puts each file on a track of its own, at the bar of the playhead. */
  const importFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        const mediaType = file.type || mediaTypeOf(file.name);
        if (!mediaType) throw new Error(`${file.name} is no sound file this app reads.`);
        const asset = await upload(file.name, mediaType, file);
        const buffer = await engine.current!.buffer(asset);
        const tempo = songRef.current?.tempo ?? (await findTempo(buffer));
        await edit((s) => {
          const take = newId();
          const name = file.name.replace(/\.[^.]+$/, '');
          const timed = { ...s, tempo: s.tempo ?? tempo };
          const bar = secondsPerBeat(timed) * timed.beatsPerBar;
          const startBeat = Math.floor(engine.current!.position() / bar) * timed.beatsPerBar;
          const added = addTrack(timed, name);
          return {
            ...placeClip(added.song, added.track, newClip(take, startBeat, buffer.duration)),
            takes: { ...timed.takes, [take]: { asset, seconds: buffer.duration, made: 'imported', words: name } },
          };
        });
      } catch (error) {
        fail(error);
      }
    }
  };

  const retry = async (id: string) => {
    const found = songRef.current ? clipOf(songRef.current, id) : undefined;
    if (!found?.ask) return;
    const pendings = await submit(found.ask, id);
    if (pendings.length === 0) return;
    await change((s) => ({
      ...withClip(s, id, (c) => ({ ...c, expected: pendings.length, failure: undefined })),
      pending: [...s.pending, ...pendings],
    }));
  };

  const keepSnippet = async (clipId: string) => {
    const current = songRef.current;
    const clip = current && clipOf(current, clipId);
    const take = clip && current.takes[clip.take];
    if (!current || !clip || !take) return;
    const snippet: Snippet = {
      id: newId(),
      name: take.words || current.title,
      asset: take.asset,
      seconds: take.seconds,
      offset: clip.offset,
      length: clip.length,
      tempo: current.tempo,
      key: current.key,
    };
    try {
      await saveSnippet(snippet);
      setSnippets(await listSnippets());
      setPanel(true);
    } catch (error) {
      fail(error);
    }
  };

  const dropSnippet = (id: string, track: string | null, beat: number) => {
    const snippet = snippets.find((s) => s.id === id);
    if (!snippet) return;
    void edit((s) => {
      const take = newId();
      const target = track ? { song: s, track } : addTrack(s, snippet.name);
      return {
        ...placeClip(target.song, target.track, newClip(take, beat, snippet.length, snippet.offset)),
        takes: { ...s.takes, [take]: { asset: snippet.asset, seconds: snippet.seconds, made: 'imported', words: snippet.name } },
      };
    });
  };

  const removeSnippet = async (snippet: Snippet) => {
    try {
      await deleteSnippet(snippet.id);
      setSnippets(await listSnippets());
      await forget([snippet.asset], null, 'Delete snippet');
    } catch (error) {
      fail(error);
    }
  };

  const renameSnippet = (snippet: Snippet, name: string) => {
    const renamed = { ...snippet, name };
    setSnippets((all) => all.map((s) => (s.id === snippet.id ? renamed : s)));
    void saveSnippet(renamed).catch(fail);
  };

  const preview = (snippet: Snippet) => {
    if (previewing === snippet.id) {
      engine.current!.stopPreview();
      setPreviewing(null);
      return;
    }
    setPreviewing(snippet.id);
    void engine.current!
      .preview(snippet.asset, snippet.offset, snippet.length, () => setPreviewing((now) => (now === snippet.id ? null : now)))
      .catch(fail);
  };

  const keepVersion = async (name: string) => {
    const current = songRef.current;
    if (!current) return;
    try {
      await saveVersion(current, newId(), name);
      setVersions(await listVersions(current.id));
      setNotice({ text: 'Version saved.' });
    } catch (error) {
      fail(error);
    }
  };

  const restoreVersion = async (version: VersionRow) => {
    try {
      const snapshot = await loadVersion(version.id);
      if (snapshot) await edit((s) => ({ ...restore(snapshot, s), id: s.id }));
    } catch (error) {
      fail(error);
    }
  };

  const exportSong = async () => {
    const current = songRef.current;
    if (!current || songSeconds(current) === 0) return;
    const pressed = Date.now();
    try {
      const file = wav(await engine.current!.render(current));
      const name = `${current.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Song'}.wav`;
      const save = () => void saveFile(name, 'audio/wav', file).catch(fail);
      if (Date.now() - pressed < CLICK_WINDOW_MS) save();
      else setNotice({ text: 'The song is ready.', action: { label: 'Save', onPress: save } });
    } catch (error) {
      fail(error);
    }
  };

  const seek = (seconds: number) => {
    const current = songRef.current;
    if (!current) return;
    setPosition(seconds);
    void engine.current!.seek(current, seconds, ended).catch(fail);
  };

  if (!loaded) return null;

  const playTip = tips('play', 'Space');
  const exportTip = tips('export', song && songSeconds(song) > 0 ? undefined : 'Make some music first.');
  const locale = navigator.language;

  return (
    <div className="ms-studio">
      {sidebar && (
        <aside className="ms-sidebar">
          <div className="ms-sidebar-head">
            <IconButton aria-label="Hide songs" onClick={() => setSidebar(false)}>
              <Icon name="side-narrow" size={16} />
            </IconButton>
          </div>
          <Button variant="secondary" fullWidth icon={<Icon name="add-line" size={14} />} onClick={() => void createSong()}>
            New song
          </Button>
          <div className="ms-songs">
            {rows.map((row) => (
              <div key={row.id} className="ms-song-row" data-selected={row.id === song?.id || undefined}>
                <button type="button" className="ms-song-open" onClick={() => void open(row.id)}>
                  <Icon name="music-2-line" size={14} />
                  <span className="ms-song-title">{row.title}</span>
                </button>
                <IconButton size="sm" aria-label={`Delete ${row.title}`} onClick={() => setDeleting(row)}>
                  <Icon name="delete-bin-line" size={14} />
                </IconButton>
              </div>
            ))}
          </div>
        </aside>
      )}
      <main
        className="ms-main"
        onDragOver={(event) => {
          if (song && event.dataTransfer.types.includes('Files')) event.preventDefault();
        }}
        onDrop={(event) => {
          if (!song || event.dataTransfer.files.length === 0) return;
          event.preventDefault();
          void importFiles([...event.dataTransfer.files]);
        }}
      >
        <header className="ms-top">
          {!sidebar && (
            <IconButton aria-label="Show songs" onClick={() => setSidebar(true)}>
              <Icon name="side-wide" size={16} />
            </IconButton>
          )}
          {song && (
            <>
              <input
                className="ms-title"
                aria-label="Song title"
                value={song.title}
                onChange={(event) => {
                  const title = event.target.value;
                  void change((s) => ({ ...s, title }));
                }}
              />
              <div className="ms-tempo">
                <TextInput
                  variant="number"
                  aria-label="Tempo"
                  placeholder="Tempo"
                  min={40}
                  max={240}
                  value={song.tempo ?? ''}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    const tempo = event.target.value === '' || !Number.isFinite(value) ? null : Math.min(240, Math.max(40, value));
                    void edit((s) => ({ ...s, tempo }));
                  }}
                />
                <span className="ms-dim">BPM</span>
              </div>
              <SettingsSelect
                label="Key"
                placeholder="Key"
                value={song.key ?? ''}
                options={[{ value: '', label: 'Any key' }, ...KEYS.map((k) => ({ value: k, label: k }))]}
                onPick={(key) => void edit((s) => ({ ...s, key: key || null }))}
                menuHeight={320}
              />
              <div className="ms-grow" />
              <IconButton aria-label="Undo" disabled={past.current.length === 0} onClick={() => void undo()}>
                <Icon name="arrow-go-back-line" size={16} />
              </IconButton>
              <IconButton aria-label="Redo" disabled={future.current.length === 0} onClick={() => void redo()}>
                <Icon name="arrow-go-forward-line" size={16} />
              </IconButton>
              <IconButton aria-label="Back to the start" onClick={() => seek(0)}>
                <Icon name="skip-back-line" size={16} />
              </IconButton>
              <span className="hs-tipwrap" {...playTip.hover}>
                <Button variant="primary" icon={<Icon name={playing ? 'stop-fill' : 'play-fill'} size={14} />} onClick={() => void togglePlay()}>
                  {playing ? 'Stop' : 'Play'}
                </Button>
                {playTip.tip}
              </span>
              <span className="ms-mono ms-clock">{clock(position)}</span>
              <IconButton aria-label="Zoom out" disabled={zoom === 0} onClick={() => setZoom((z) => Math.max(0, z - 1))}>
                <Icon name="zoom-out-line" size={16} />
              </IconButton>
              <IconButton aria-label="Zoom in" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => Math.min(ZOOMS.length - 1, z + 1))}>
                <Icon name="zoom-in-line" size={16} />
              </IconButton>
              <Button variant="secondary" icon={<Icon name="upload-2-line" size={14} />} onClick={() => picker.current?.click()}>
                Import
              </Button>
              <input
                ref={picker}
                type="file"
                accept="audio/*,.wav,.mp3,.flac,.ogg,.opus,.m4a,.aac,.webm"
                multiple
                hidden
                onChange={(event) => {
                  const files = [...(event.target.files ?? [])];
                  event.target.value = '';
                  void importFiles(files);
                }}
              />
              <Versions
                versions={versions}
                locale={locale}
                onOpen={() => void listVersions(song.id).then(setVersions, fail)}
                onSave={(name) => void keepVersion(name)}
                onRestore={(version) => void restoreVersion(version)}
              />
              <span className="hs-tipwrap" {...exportTip.hover}>
                <Button
                  variant="secondary"
                  icon={<Icon name="download-2-line" size={14} />}
                  disabled={songSeconds(song) === 0}
                  onClick={() => void exportSong()}
                >
                  Export
                </Button>
                {exportTip.tip}
              </span>
              <IconButton aria-label={panel ? 'Hide snippets' : 'Show snippets'} onClick={() => setPanel((p) => !p)}>
                <Icon name="bookmark-line" size={16} />
              </IconButton>
            </>
          )}
        </header>
        {song ? (
          <div className="ms-body">
            <div className="ms-work">
              {song.tracks.length > 0 ? (
                <Timeline
                  song={song}
                  engine={engine.current}
                  position={position}
                  pixelsPerSecond={ZOOMS[zoom]!}
                  jobs={jobs}
                  selected={selected}
                  onSelect={setSelected}
                  onSeek={seek}
                  onEdit={(update) => void edit(update)}
                  onKeep={(clip) => void edit((s) => withClip(s, clip, (c) => ({ ...c, versions: [], expected: 0 })))}
                  onRetry={(clip) => void retry(clip)}
                  onSnippet={(clip) => void keepSnippet(clip)}
                  onDropSnippet={dropSnippet}
                />
              ) : (
                <div className="ms-empty">
                  <EmptyState icon={<Icon name="music-ai-line" size={30} />} title="Describe a song to make it" />
                </div>
              )}
              <MakePanel
                models={models}
                picked={picked}
                onPick={(card) => {
                  localStorage.setItem('music-model', card);
                  setPicked(card);
                }}
                onMake={(request) => void make(request)}
              />
            </div>
            {panel && (
              <aside className="ms-panel">
                <div className="ms-panel-head ms-strong">Snippets</div>
                <Snippets
                  snippets={snippets}
                  previewing={previewing}
                  onPreview={preview}
                  onRename={renameSnippet}
                  onDelete={(snippet) => void removeSnippet(snippet)}
                />
              </aside>
            )}
          </div>
        ) : (
          <div className="ms-empty">
            <EmptyState icon={<Icon name="music-2-line" size={30} />} title="No song yet">
              <Button icon={<Icon name="add-line" size={14} />} onClick={() => void createSong()}>
                New song
              </Button>
            </EmptyState>
          </div>
        )}
      </main>
      {deleting && (
        <ShellConfirm
          title={`Delete ${deleting.title}?`}
          body="Its audio is deleted too."
          action="Delete"
          tone="danger"
          onConfirm={() => void removeSong(deleting)}
          onCancel={() => setDeleting(null)}
        />
      )}
      {notice && (
        <Toast action={notice.action} onClose={() => setNotice(null)}>
          {notice.text}
        </Toast>
      )}
    </div>
  );
}

/** A job of a song that is not open: its song takes the result and is kept. */
async function settleElsewhere(job: Job, engine: Engine): Promise<void> {
  const { rows } = await call('hearthscale/db/query', {
    sql: `SELECT id FROM songs WHERE EXISTS (
      SELECT 1 FROM json_each(songs.doc, '$.pending') WHERE json_extract(value, '$.job') = ?
    )`,
    params: [job.id],
  });
  const id = (rows[0] as { id: string } | undefined)?.id;
  if (!id) return;
  const found = await loadSong(id);
  if (!found) return;
  await saveSong(await settle(found, job, engine));
}

const SOUND_TYPES: Record<string, string> = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  webm: 'audio/webm',
};

/** The media type of a sound file by its extension, for a file the system gives none. */
function mediaTypeOf(name: string): string | undefined {
  return SOUND_TYPES[name.split('.').pop()?.toLowerCase() ?? ''];
}

function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

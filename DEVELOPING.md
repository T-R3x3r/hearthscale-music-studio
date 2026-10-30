# Developing Music studio

`README.md` is the text the Marketplace shows to the people who install the
app. This file is for the people who work on it.

Music studio is an ordinary Hearthscale app: one view, `studio`, in the rail
and in tabs, and a backend with one tool. Everything it knows of the
platform comes from the developer documentation and the SDK.

## Build

```sh
npm install
npm run check   # TypeScript
npm run build   # writes views/studio.js
```

The view is React under `src/`, bundled by `build.mjs` into
`views/studio.js`, the one file the package carries for it. Commit the built
file with every change to the source. `backend.ts` is bundled by
`hearthscale dev` and `hearthscale pack`.

The SDK packages come from the pre-release builder kit as files
(`package.json` names their paths). Point them at the npm releases once
those carry the same version.

## Run

With a development Hearthscale running:

```sh
hearthscale dev .
```

Close and open the app's tab again after `npm run build` to load the view.

## How it works

- **Layout** (`src/Studio.tsx`, `src/ui.css`): the layout of Suno Studio
  in Hearthscale's styling. A toolbar with the song and its actions, the
  transport above the timeline, the Make or edit panel under it, the
  assistant docked on the left and the library of songs and snippets on
  the right. Under 960 px the docks float over the timeline and the
  library starts closed; under 640 px the toolbar keeps its rarer actions
  in a menu. Every length, colour and type size is a token of the UI kit.
  Waveforms are drawn on a canvas in `--mut`, the played part in `--text`,
  and drawn again when the host's look changes.
- **Songs** live in the app's SQLite database (`db` in `uses`), one row per
  song with its document as JSON (`src/library.ts`, `src/song.ts`). A clip's
  place is in beats, so a change of tempo moves it with the song.
- **Audio** is assets of the app: the outputs of music jobs and the files
  the person imports (`hearthscale/ui/upload-file`). The view streams them
  from `hearthscale/assetBytes` and decodes them in one `AudioContext` at
  48 kHz (`src/audio.ts`). Every clip is scheduled on that context's clock
  when playback starts, so tracks never drift. The export renders the same
  graph in an `OfflineAudioContext` and saves a 16-bit WAV with
  `ui/download-file`.
- **Music jobs** run from the view (`hearthscale/jobs/*`). The app reads
  each music model's input schema from its card (`src/music.ts`) and sends
  only the fields that schema lists. Each take is one job with its own
  seed, where the model takes one. The jobs under way are kept with the song,
  so a view that opens again follows them (`src/jobs.ts`).
- **Edits** (`src/edits.ts`): the edits a music model makes are read from
  its schema, by the field names the developer documentation gives: a
  `route` enum (`cover`, `repaint`, `lego`) or an `audioInputKind` enum
  (`init_audio`, `inpaint_audio`). An edit renders the clip to a WAV,
  uploads it as the job's `audio`, keeps the clip's own audio as its first
  take, and plays the result at once. Extend redraws silence
  added after the clip.
- **Splits**: a clip rendered at 44.1 kHz goes to a `separation` job; each
  part lands on a track of its own and the source track mutes.
- **Lyrics** (`src/lyrics.ts`): sections a singing model reads, written
  and rewritten by the app's chat model through `hearthscale/models/complete`.
- **Recording** (`src/recorder.ts`, `assets/capture.js`): the view opens
  the microphone (`permissions: ["microphone"]`) and an AudioWorklet from
  the package's `assets/` hands each block of sound with its frame on the
  engine's clock, so a take lines up with the song, less the measured
  latency.
- **Snippets and versions** live in the database beside the songs. Audio is
  released only when no song and no snippet uses it any more. A snippet of
  another tempo or key is fitted to the song when it is dropped
  (`src/fit.ts`), with Signalsmith Stretch (MIT). The library builds its
  AudioWorklet module as a `blob:` address, which a view may not load, so
  `build.mjs` writes that module to `assets/stretch.js` and the view loads
  it from the package.
- **Track sounds and Louder** (`src/audio.ts`): Warmer and Brighter are
  shelf filters, More space a room echo; Louder compresses the song and
  makes up its level before the limiter.
- **Export**: the song as a WAV through `ui/download-file`, or each track
  alone into a folder the person picks (`roots`), written by the backend
  tool `export_parts`. Both need a click: when rendering takes longer than
  a click stays good for, a message offers Save.
- **Opening files**: the surface `opens` common sound files; a file opened
  with the app becomes a song of its own, once per file.
- **The assistant** (`src/Assistant.tsx`, `src/context.ts`, `prompt/`):
  the view places the shell's chat in a panel and keeps the open song in a
  chip on that chat. The agent's tools (`make_music`, `change_clip`,
  `split_clip`, `set_song`, `mix_track`) hand their input to the view as an
  event (`events`), and the view does the same actions as its buttons, so
  the song has one writer.
- **Deleting** releases audio through the backend tool `forget_audio`,
  which only the app's views call.
- **Settings**: `versions`, Takes to choose from: how many takes each new
  piece or change comes as (1 to 4).

After every rebuild that `hearthscale dev` makes, an open view's requests
fail with "this window hosts no such view" until its tab loads again.

## Licence

MIT. See `LICENSE`.

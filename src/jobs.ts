/**
 * Music jobs and the songs that wait for them. A job that ends adds its
 * audio as a take, a version of the clip it was made for; a job that fails
 * leaves its reason on the clip.
 */
import type { Job } from '@hearthscale/app';
import type { Engine } from './audio';
import { call } from './bridge';
import { newId, withClip, type Song } from './song';

export function isOver(job: Job): boolean {
  return job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled';
}

/** The song with an ended job's result in it, or the song as it was. */
export async function settle(song: Song, job: Job, engine: Engine): Promise<Song> {
  const pending = song.pending.find((p) => p.job === job.id);
  if (!pending || !isOver(job)) return song;
  let next: Song = { ...song, pending: song.pending.filter((p) => p.job !== job.id) };
  const output = job.status === 'completed' ? job.outputs?.find((o) => o.asset && o.mediaType.startsWith('audio/')) : undefined;
  if (output?.asset) {
    const buffer = await engine.buffer(output.asset);
    const take = newId();
    next = {
      ...next,
      takes: {
        ...next.takes,
        [take]: {
          asset: output.asset,
          seconds: buffer.duration,
          made: 'generated',
          words: pending.words,
          seed: pending.seed,
          model: job.model,
        },
      },
    };
    next = withClip(next, pending.clip, (clip) =>
      clip.take
        ? { ...clip, versions: [...clip.versions, take] }
        : { ...clip, take, versions: [...clip.versions, take], length: buffer.duration },
    );
  } else {
    const failure = job.status === 'cancelled' ? 'Stopped.' : (job.error ?? 'The music model made no audio.');
    next = withClip(next, pending.clip, (clip) => ({ ...clip, expected: clip.expected - 1, failure }));
  }
  return tidy(next, pending.clip);
}

/** Clears a clip's choice once every version has come and there is only one to choose. */
function tidy(song: Song, clipId: string): Song {
  const waiting = song.pending.some((p) => p.clip === clipId);
  if (waiting) return song;
  return withClip(song, clipId, (clip) => (clip.versions.length <= 1 ? { ...clip, versions: [], expected: 0 } : clip));
}

/** Reads each job the song waits for, for the ones that ended while the view was away. */
export async function catchUp(song: Song, engine: Engine): Promise<Song> {
  let next = song;
  for (const pending of song.pending) {
    try {
      const { job } = await call('hearthscale/jobs/get', { id: pending.job });
      next = await settle(next, job, engine);
    } catch (error) {
      const lost = { id: pending.job, status: 'failed', error: error instanceof Error ? error.message : String(error) } as Job;
      next = await settle(next, lost, engine);
    }
  }
  return next;
}

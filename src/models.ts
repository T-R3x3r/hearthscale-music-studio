/**
 * The music model the app runs, the one chosen for it in the model slot or
 * on its settings page, and the music models a Server offers to download,
 * with the downloads under way.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ModelCard, ModelDownload } from '@hearthscale/app';
import { call, onNote, reason } from './bridge';

export interface MusicModels {
  /** The music model the app runs, or null with `why`. */
  card: ModelCard | null;
  why: string | null;
  /** The music models a Server offers to download, and the ones on their way. */
  offered: ModelCard[];
  downloads: Record<string, ModelDownload>;
  /** Lists the models again and answers the app's music model. */
  refresh: () => Promise<ModelCard | null>;
  /** Asks the person to download a model; on a click only. */
  install: (card: string) => Promise<void>;
}

export function useMusicModels(): MusicModels {
  const [card, setCard] = useState<ModelCard | null>(null);
  const [why, setWhy] = useState<string | null>(null);
  const [offered, setOffered] = useState<ModelCard[]>([]);
  const [downloads, setDownloads] = useState<Record<string, ModelDownload>>({});

  const refresh = useCallback(async () => {
    try {
      const [now, missing, coming] = await Promise.all([
        call('hearthscale/models/list', { kind: 'music' }),
        call('hearthscale/models/list', { kind: 'music', state: 'absent' }),
        call('hearthscale/models/list', { kind: 'music', state: 'downloading' }),
      ]);
      const pick = now.chosen.music;
      const chosen = pick && 'source' in pick ? (now.cards.find((c) => c.id === pick.card && c.state === 'ready') ?? null) : null;
      setCard(chosen);
      setWhy(chosen ? null : pick && 'reason' in pick ? pick.reason : 'No music model is chosen for Music studio.');
      setOffered([...coming.cards, ...missing.cards]);
      setDownloads((before) => {
        const next = { ...before };
        for (const item of coming.cards) next[item.id] = { card: item.id, state: 'downloading', progress: item.progress };
        return next;
      });
      return chosen;
    } catch (error) {
      setCard(null);
      setWhy(reason(error));
      return null;
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onNote((note) => {
      if (note.method === 'hearthscale/models/chosen' && note.params.kind === 'music') void refresh();
      if (note.method !== 'hearthscale/models/download') return;
      const { download } = note.params;
      setDownloads((before) => ({ ...before, [download.card]: download }));
      if (download.state !== 'downloading') void refresh();
    });
  }, [refresh]);

  const install = useCallback(
    async (target: string) => {
      const { card: installing } = await call('hearthscale/models/install', { target });
      if (installing) setDownloads((before) => ({ ...before, [installing]: { card: installing, state: 'downloading' } }));
      await refresh();
    },
    [refresh],
  );

  return { card, why, offered, downloads, refresh, install };
}

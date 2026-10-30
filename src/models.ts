/**
 * The music models the person can run, the one the app runs when the
 * person picks none, the ones a Server offers to install, and the
 * downloads under way.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ModelCard, ModelDownload } from '@hearthscale/app';
import { call, onNote, reason } from './bridge';

export interface MusicModels {
  ready: ModelCard[];
  /** The card the app runs music on, or null with the reason. */
  chosen: { card: string | null; reason?: string };
  /** The models a Server offers to install, and the ones on their way. */
  offered: ModelCard[];
  downloads: Record<string, ModelDownload>;
  /** Why the list could not be read. */
  failure: string | null;
  /** Asks the person to install a model; on a click only. */
  install: (card: string) => Promise<void>;
}

/** The music model a request runs on: the one the person picked here, else the app's, else the first ready one. */
export function musicCard(models: MusicModels, picked: string | null): ModelCard | null {
  return models.ready.find((c) => c.id === (picked ?? models.chosen.card)) ?? models.ready[0] ?? null;
}

export function useMusicModels(): MusicModels {
  const [ready, setReady] = useState<ModelCard[]>([]);
  const [chosen, setChosen] = useState<{ card: string | null; reason?: string }>({ card: null });
  const [offered, setOffered] = useState<ModelCard[]>([]);
  const [downloads, setDownloads] = useState<Record<string, ModelDownload>>({});
  const [failure, setFailure] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [now, missing, coming] = await Promise.all([
        call('hearthscale/models/list', { kind: 'music' }),
        call('hearthscale/models/list', { kind: 'music', state: 'absent' }),
        call('hearthscale/models/list', { kind: 'music', state: 'downloading' }),
      ]);
      setReady(now.cards.filter((card) => card.state === 'ready'));
      const pick = now.chosen.music;
      setChosen(pick ? (pick.card === null ? { card: null, reason: pick.reason } : { card: pick.card }) : { card: null });
      setOffered([...coming.cards, ...missing.cards]);
      setDownloads((before) => {
        const next = { ...before };
        for (const card of coming.cards) {
          next[card.id] = { card: card.id, state: 'downloading', progress: card.progress };
        }
        return next;
      });
      setFailure(null);
    } catch (error) {
      setFailure(reason(error));
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onNote((note) => {
      if (note.method !== 'hearthscale/models/download') return;
      const { download } = note.params;
      setDownloads((before) => ({ ...before, [download.card]: download }));
      if (download.state !== 'downloading') void refresh();
    });
  }, [refresh]);

  const install = useCallback(
    async (card: string) => {
      const { card: installing } = await call('hearthscale/models/install', { target: card });
      if (installing) {
        setDownloads((before) => ({ ...before, [installing]: { card: installing, state: 'downloading' } }));
      }
      await refresh();
    },
    [refresh],
  );

  return { ready, chosen, offered, downloads, failure, install };
}

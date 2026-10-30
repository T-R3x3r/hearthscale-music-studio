/**
 * The music model the app runs: the one the person chose for the app on its
 * settings page in Hearthscale, or why none runs.
 */
import { useCallback, useEffect, useState } from 'react';
import type { ModelCard } from '@hearthscale/app';
import { call, onNote, reason } from './bridge';

export interface MusicModel {
  card: ModelCard | null;
  /** Why no music model runs, when none does. */
  reason: string | null;
}

export function useMusicModel(): MusicModel {
  const [model, setModel] = useState<MusicModel>({ card: null, reason: null });

  const refresh = useCallback(async () => {
    try {
      const { cards, chosen } = await call('hearthscale/models/list', { kind: 'music' });
      const pick = chosen.music;
      const card = pick && 'source' in pick ? (cards.find((c) => c.id === pick.card && c.state === 'ready') ?? null) : null;
      const why = pick && 'reason' in pick ? pick.reason : 'No music model is chosen for Music studio.';
      setModel({ card, reason: card ? null : why });
    } catch (error) {
      setModel({ card: null, reason: reason(error) });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const again = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', again);
    window.addEventListener('focus', again);
    const stop = onNote((note) => {
      if (note.method === 'hearthscale/models/download' && note.params.download.state !== 'downloading') void refresh();
    });
    return () => {
      document.removeEventListener('visibilitychange', again);
      window.removeEventListener('focus', again);
      stop();
    };
  }, [refresh]);

  return model;
}

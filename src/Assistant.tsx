import { useEffect, useRef, useState } from 'react';
import { chatContext, keepWidgetState, onNote, placeSlots, widgetState } from './bridge';

const SLOT = 'chat';

/** Milliseconds the song stays unchanged before its context goes to the chip again. */
const SETTLE_MS = 800;

interface Props {
  /** The song's title, the chip's label. */
  title: string;
  /** The open song in words, which rides the next message as a chip. */
  context: string;
}

/** The space the shell's chat with the app's assistant takes in the view. */
export function Assistant({ title, context }: Props) {
  const room = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<string | null>(() => {
    const kept = (widgetState() as { chat?: string } | null)?.chat;
    return typeof kept === 'string' ? kept : null;
  });
  const [placed, setPlaced] = useState(false);

  useEffect(() => {
    const element = room.current;
    if (!element) return;
    const place = () => {
      const box = element.getBoundingClientRect();
      void placeSlots([
        {
          id: SLOT,
          kind: 'chat',
          session,
          insets: { left: box.left, top: box.top, right: window.innerWidth - box.right, bottom: window.innerHeight - box.bottom },
        },
      ]).then(() => setPlaced(true));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(element);
    return () => {
      observer.disconnect();
      void placeSlots([]);
    };
  }, [session]);

  useEffect(
    () =>
      onNote((note) => {
        if (note.method === 'hearthscale/ui/slot-session' && note.params.id === SLOT) {
          setSession(note.params.session);
          void keepWidgetState({ chat: note.params.session });
        }
        if (note.method === 'hearthscale/sessions/changed') void chatContext(SLOT, title, context);
      }),
    [title, context],
  );

  useEffect(() => {
    if (!placed) return;
    const timer = window.setTimeout(() => void chatContext(SLOT, title, context), SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [placed, title, context]);

  return <div ref={room} className="ms-chat-room" />;
}

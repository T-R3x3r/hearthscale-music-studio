/**
 * The shell's slots in the view, such as the assistant's chat and the music
 * model's picker. Hearthscale takes the whole list of a view's slots in one
 * request, so every slot goes through this one list.
 */
import { useLayoutEffect, useEffect, useRef, useState, type RefObject } from 'react';
import type { HostSlot } from '@hearthscale/app';
import { call } from './bridge';

type Insets = HostSlot['insets'];

const slots = new Map<string, HostSlot>();
let sent: Promise<unknown> = Promise.resolve();

/** Places or moves one slot, or removes it with `null`, and sends the view's whole list. */
function setSlot(id: string, slot: HostSlot | null): Promise<unknown> {
  if (slot) slots.set(id, slot);
  else slots.delete(id);
  const list = [...slots.values()];
  const next = sent.then(() => call('hearthscale/ui/slots', { slots: list }));
  sent = next.catch(() => undefined);
  return next;
}

/**
 * Keeps the slot `id` over the element the returned ref holds, at its place
 * after every render and every change of size, until the element goes. The
 * flag turns true once the host has the slot.
 */
export function useSlot<T extends HTMLElement>(id: string, build: (insets: Insets) => HostSlot): [RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [placed, setPlaced] = useState(false);
  const last = useRef('');
  const latest = useRef(build);
  latest.current = build;

  const place = useRef(() => {
    const element = ref.current;
    if (!element) return;
    const box = element.getBoundingClientRect();
    const slot = latest.current({
      left: box.left,
      top: box.top,
      right: window.innerWidth - box.right,
      bottom: window.innerHeight - box.bottom,
    });
    const key = JSON.stringify(slot);
    if (key === last.current) return;
    last.current = key;
    void setSlot(id, slot).then(() => setPlaced(true));
  }).current;

  useLayoutEffect(place);

  useEffect(() => {
    const observer = new ResizeObserver(place);
    observer.observe(document.body);
    if (ref.current) observer.observe(ref.current);
    return () => {
      observer.disconnect();
      last.current = '';
      void setSlot(id, null);
    };
  }, [id, place]);

  return [ref, placed];
}

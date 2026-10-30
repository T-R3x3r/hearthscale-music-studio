import { useState } from 'react';
import { Button, Chip, Icon, IconButton, Label, Slider, useFloatingTips, type IconName } from '@hearthscale/app-ui';
import { PARTS } from './edits';
import { sentenceCase } from './text';

export type EditKind = 'restyle' | 'repaint' | 'longer' | 'add';

export interface EditRequest {
  kind: EditKind;
  clip: string;
  words: string;
  /** How far a new style moves from the clip, 0 to 1. */
  change: number;
  /** Seconds to add at the end. */
  seconds: number;
  part: string;
}

interface Props {
  kind: EditKind;
  clip: string;
  /** The words the clip was made from, which the panel starts with. */
  words: string;
  /** The bars a part to redo spans, in words, or why there is none. */
  bars: { label: string } | { missing: string };
  /** The longest the model makes, in seconds. */
  longest: number;
  onGo: (request: EditRequest) => void;
  onClose: () => void;
}

/** The name and the mark of each edit, in the clip's menu and on the panel. */
export const EDITS: Record<EditKind, { title: string; icon: IconName }> = {
  restyle: { title: 'Change style', icon: 'palette-line' },
  repaint: { title: 'Redo bars', icon: 'brush-line' },
  longer: { title: 'Extend', icon: 'expand-right-line' },
  add: { title: 'Add instrument', icon: 'add-circle-line' },
};

export function EditPanel({ kind, clip, words: start, bars, longest, onGo, onClose }: Props) {
  const [words, setWords] = useState(start);
  const [change, setChange] = useState(0.5);
  const [seconds, setSeconds] = useState(Math.min(longest, 15));
  const [part, setPart] = useState(PARTS[0]!);
  const tips = useFloatingTips('top');
  const { title, icon } = EDITS[kind];
  const missing = kind === 'repaint' && 'missing' in bars ? bars.missing : undefined;
  const blocked = missing ?? (words.trim() ? undefined : 'Describe the music first');
  const go = tips('go', blocked);
  return (
    <div className="ms-make">
      <div className="ms-edit-head">
        <Icon name={icon} size={16} />
        <span className="ms-strong">{title}</span>
        {kind === 'repaint' && 'label' in bars && <span className="ms-dim">{bars.label}</span>}
        <div className="hs-flex-spacer" />
        <IconButton size="sm" aria-label="Close" onClick={onClose}>
          <Icon name="close-line" size={14} />
        </IconButton>
      </div>
      <textarea
        className="ms-words hs-ta"
        aria-label="Description"
        placeholder="Slow acoustic version with brushed drums"
        value={words}
        rows={2}
        onChange={(event) => setWords(event.target.value)}
      />
      {kind === 'add' && (
        <div className="ms-chips">
          {PARTS.map((name) => (
            <Chip key={name} selected={part === name} onClick={() => setPart(name)}>
              {sentenceCase(name)}
            </Chip>
          ))}
        </div>
      )}
      <div className="ms-make-row">
        {kind === 'restyle' && (
          <div className="ms-length">
            <Label>Amount of change</Label>
            <Slider label="Amount of change" value={change} onChange={setChange} step={0.05} shown={`${Math.round(change * 100)}%`} />
          </div>
        )}
        {kind === 'longer' && (
          <div className="ms-length">
            <Label>Added length</Label>
            <Slider label="Added length" min={2} max={longest} step={1} value={seconds} onChange={setSeconds} shown={`${seconds} s`} />
          </div>
        )}
        <div className="hs-flex-spacer" />
        <span className="hs-tipwrap" {...go.hover}>
          <Button
            variant="primary"
            icon={<Icon name={icon} size={14} />}
            disabled={blocked !== undefined}
            onClick={() => onGo({ kind, clip, words, change, seconds, part })}
          >
            {title}
          </Button>
          {go.tip}
        </span>
      </div>
    </div>
  );
}

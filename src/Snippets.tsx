import { Button, EmptyState, Icon, useFloatingTips } from '@hearthscale/app-ui';
import { TipIconButton } from './TipIconButton';
import type { Snippet } from './library';
import { SNIPPET_DRAG } from './Timeline';

interface Props {
  snippets: Snippet[];
  previewing: string | null;
  onPreview: (snippet: Snippet) => void;
  onRename: (snippet: Snippet, name: string) => void;
  onDelete: (snippet: Snippet) => void;
  /** Whether a clip is picked, which an empty list offers to save. */
  picked: boolean;
  onSavePicked: () => void;
}

export function Snippets({ snippets, previewing, onPreview, onRename, onDelete, picked, onSavePicked }: Props) {
  const tips = useFloatingTips('bottom-start');
  const save = tips('save', picked ? undefined : 'Pick a clip first');
  return (
    <div className="ms-snippets">
      {snippets.length === 0 && (
        <EmptyState icon={<Icon name="bookmark-line" size={30} />} title="No snippets yet">
          <span className="hs-tipwrap" {...save.hover}>
            <Button variant="secondary" icon={<Icon name="bookmark-line" size={14} />} disabled={!picked} onClick={onSavePicked}>
              Save picked clip
            </Button>
            {save.tip}
          </span>
        </EmptyState>
      )}
      {snippets.map((snippet) => (
        <div
          key={snippet.id}
          className="ms-snippet hs-hovbox"
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData(SNIPPET_DRAG, snippet.id);
            event.dataTransfer.effectAllowed = 'copy';
          }}
        >
          <TipIconButton size="sm" aria-label={previewing === snippet.id ? 'Stop' : 'Listen'} onClick={() => onPreview(snippet)}>
            <Icon name={previewing === snippet.id ? 'stop-line' : 'play-line'} size={14} />
          </TipIconButton>
          <input
            className="ms-snippet-name"
            aria-label="Snippet name"
            value={snippet.name}
            onChange={(event) => onRename(snippet, event.target.value)}
          />
          <span className="ms-dim ms-num">{snippet.length.toFixed(1)} s</span>
          <TipIconButton size="sm" className="ms-row-action" aria-label={`Delete ${snippet.name}`} onClick={() => onDelete(snippet)}>
            <Icon name="delete-bin-line" size={14} />
          </TipIconButton>
        </div>
      ))}
    </div>
  );
}

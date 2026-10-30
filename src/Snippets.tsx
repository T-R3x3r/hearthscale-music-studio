import { Icon, IconButton, useFloatingTips } from '@hearthscale/app-ui';
import type { Snippet } from './library';
import { SNIPPET_DRAG } from './Timeline';

interface Props {
  snippets: Snippet[];
  previewing: string | null;
  onPreview: (snippet: Snippet) => void;
  onRename: (snippet: Snippet, name: string) => void;
  onDelete: (snippet: Snippet) => void;
}

export function Snippets({ snippets, previewing, onPreview, onRename, onDelete }: Props) {
  const tips = useFloatingTips('bottom-start');
  const empty = tips('empty', 'Save a clip as a snippet from its menu, then drag it onto a track');
  return (
    <div className="ms-snippets">
      {snippets.length === 0 && (
        <div className="ms-quiet hs-tipwrap" {...empty.hover}>
          No snippets yet
          {empty.tip}
        </div>
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
          <IconButton size="sm" aria-label={previewing === snippet.id ? 'Stop' : 'Listen'} onClick={() => onPreview(snippet)}>
            <Icon name={previewing === snippet.id ? 'stop-line' : 'play-line'} size={14} />
          </IconButton>
          <input
            className="ms-snippet-name"
            aria-label="Snippet name"
            value={snippet.name}
            onChange={(event) => onRename(snippet, event.target.value)}
          />
          <span className="ms-dim ms-num">{snippet.length.toFixed(1)} s</span>
          <IconButton size="sm" className="ms-row-action" aria-label={`Delete ${snippet.name}`} onClick={() => onDelete(snippet)}>
            <Icon name="delete-bin-line" size={14} />
          </IconButton>
        </div>
      ))}
    </div>
  );
}

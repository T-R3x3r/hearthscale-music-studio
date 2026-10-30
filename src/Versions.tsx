import { useRef, useState } from 'react';
import { anchorFrom, Button, Icon, MDivider, MenuSurface, MItem, Popover, TextInput, type MenuAnchor } from '@hearthscale/app-ui';
import type { VersionRow } from './library';

interface Props {
  versions: VersionRow[];
  locale: string;
  onOpen: () => void;
  onSave: (name: string) => void;
  onRestore: (version: VersionRow) => void;
}

export function Versions({ versions, locale, onOpen, onSave, onRestore }: Props) {
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const button = useRef<HTMLSpanElement>(null);
  const when = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const save = () => {
    if (!name.trim()) return;
    onSave(name.trim());
    setName('');
    setNaming(false);
  };
  return (
    <span ref={button}>
      <Button
        variant="secondary"
        icon={<Icon name="history-line" size={14} />}
        onClick={(event) => {
          onOpen();
          setMenu(anchorFrom('versions', event));
        }}
      >
        Versions
      </Button>
      {menu && (
        <MenuSurface anchor={menu} onDismiss={() => setMenu(null)} maxHeight={360}>
          <MItem
            icon={<Icon name="save-line" size={14} />}
            label="Save a version"
            onClick={() => {
              setMenu(null);
              setNaming(true);
            }}
          />
          {versions.length > 0 && <MDivider />}
          {versions.map((version) => (
            <MItem
              key={version.id}
              icon={<Icon name="arrow-go-back-line" size={14} />}
              label={version.name}
              sub={when.format(version.created)}
              onClick={() => {
                setMenu(null);
                onRestore(version);
              }}
            />
          ))}
        </MenuSurface>
      )}
      {naming && button.current && (
        <Popover anchor={button.current} placement="bottom-end" label="Save a version" onDismiss={() => setNaming(false)}>
          <div className="ms-popover">
            <TextInput
              aria-label="Version name"
              placeholder="Version name"
              value={name}
              data-autofocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') save();
              }}
            />
            <Button variant="primary" disabled={!name.trim()} onClick={save}>
              Save
            </Button>
          </div>
        </Popover>
      )}
    </span>
  );
}

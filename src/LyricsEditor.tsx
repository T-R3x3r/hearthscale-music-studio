import { useState } from 'react';
import { Button, Icon, Label, Notice, SettingsSelect, useFloatingTips } from '@hearthscale/app-ui';
import { TipIconButton } from './TipIconButton';
import { reason } from './bridge';
import { rewriteSection, SECTIONS, writeLyrics, type LyricSection, type SectionName } from './lyrics';

/** The example each kind of section shows in its empty field. */
const EXAMPLES: Record<SectionName, string> = {
  Intro: 'Humming low before the day begins',
  Verse: 'Walking home through the summer rain',
  'Pre-chorus': 'And I feel it coming closer',
  Chorus: 'And the streetlights sing along',
  Bridge: 'Maybe we were never lost at all',
  Outro: 'Still humming, all the way home',
};

interface Props {
  /** What the song is about, in the person's words, which the writer reads. */
  about: string;
  sections: LyricSection[];
  onChange: (sections: LyricSection[]) => void;
}

export function LyricsEditor({ about, sections, onChange }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [firstVerse] = useState<LyricSection>(() => ({ id: crypto.randomUUID(), name: 'Verse', text: '' }));
  const shown = sections.length > 0 ? sections : [firstVerse];
  const [failure, setFailure] = useState<string | null>(null);
  const tips = useFloatingTips('top');
  const write = tips('write', about.trim() ? undefined : 'Describe the song first');

  const run = async (key: string, work: () => Promise<void>) => {
    setBusy(key);
    setFailure(null);
    try {
      await work();
    } catch (error) {
      setFailure(reason(error));
    } finally {
      setBusy(null);
    }
  };

  const set = (id: string, change: Partial<LyricSection>) =>
    onChange(shown.map((s) => (s.id === id ? { ...s, ...change } : s)));

  return (
    <div className="ms-lyrics">
      <Label>Lyrics</Label>
      {shown.map((section) => (
        <div key={section.id} className="ms-lyric">
          <div className="ms-lyric-head">
            <SettingsSelect
              label="Section"
              value={section.name}
              options={SECTIONS.map((name) => ({ value: name, label: name }))}
              onPick={(name: SectionName) => set(section.id, { name })}
            />
            <div className="hs-flex-spacer" />
            <TipIconButton
              size="sm"
              aria-label="Rewrite"
              disabled={busy !== null || !section.text.trim()}
              onClick={() => void run(section.id, async () => set(section.id, { text: await rewriteSection(about, section, shown) }))}
            >
              <Icon name={busy === section.id ? 'loader-4-line' : 'refresh-line'} size={14} className={busy === section.id ? 'hs-spin' : undefined} />
            </TipIconButton>
            {sections.length > 0 && (
              <TipIconButton size="sm" aria-label="Remove section" onClick={() => onChange(sections.filter((s) => s.id !== section.id))}>
                <Icon name="close-line" size={14} />
              </TipIconButton>
            )}
          </div>
          <textarea
            className="ms-words hs-ta"
            aria-label={`${section.name} lyrics`}
            placeholder={EXAMPLES[section.name]}
            rows={Math.max(2, section.text.split('\n').length)}
            value={section.text}
            onChange={(event) => set(section.id, { text: event.target.value })}
          />
        </div>
      ))}
      {failure && <Notice>{failure}</Notice>}
      <div className="ms-make-row">
        <span className="hs-tipwrap" {...write.hover}>
          <Button
            variant="secondary"
            size="sm"
            icon={<Icon name={busy === 'all' ? 'loader-4-line' : 'quill-pen-line'} size={14} className={busy === 'all' ? 'hs-spin' : undefined} />}
            disabled={busy !== null || !about.trim()}
            onClick={() => void run('all', async () => onChange(await writeLyrics(about)))}
          >
            Write lyrics
          </Button>
          {write.tip}
        </span>
        <Button
          variant="ghost"
          size="sm"
          icon={<Icon name="add-line" size={14} />}
          onClick={() => onChange([...shown, { id: crypto.randomUUID(), name: 'Chorus', text: '' }])}
        >
          Add section
        </Button>
      </div>
    </div>
  );
}

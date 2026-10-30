import { IconButton, useFloatingTips, type IconButtonProps } from '@hearthscale/app-ui';

/** An icon button that shows its label in a tip under the pointer, as a button with no words needs. */
export function TipIconButton(props: IconButtonProps & { 'aria-label': string }) {
  const tips = useFloatingTips('top');
  const tip = tips('label', props['aria-label']);
  return (
    <span className="hs-tipwrap" {...tip.hover}>
      <IconButton {...props} />
      {tip.tip}
    </span>
  );
}

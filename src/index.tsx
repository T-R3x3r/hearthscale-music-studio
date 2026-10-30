import { createRoot } from 'react-dom/client';
import { PublisherPicturesContext } from '@hearthscale/app-ui';
import { call, connect, publisherPicture } from './bridge';
import { Studio } from './Studio';
import sheet from './ui.css';

const style = document.createElement('style');
style.textContent = sheet;
document.head.append(style);

await connect();
void call('hearthscale/ui/set-tab', { title: 'Music studio' });
const root = document.createElement('div');
root.className = 'ms-root';
document.body.append(root);
createRoot(root).render(
  <PublisherPicturesContext value={publisherPicture}>
    <Studio />
  </PublisherPicturesContext>,
);

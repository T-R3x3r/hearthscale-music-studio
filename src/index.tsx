import { createRoot } from 'react-dom/client';
import { PublisherPicturesContext } from '@hearthscale/app-ui';
import { connect, publisherPicture } from './bridge';
import { Studio } from './Studio';
import sheet from './ui.css';

const style = document.createElement('style');
style.textContent = sheet;
document.head.append(style);

await connect();
const root = document.createElement('div');
root.className = 'ms-root';
document.body.append(root);
createRoot(root).render(
  <PublisherPicturesContext value={publisherPicture}>
    <Studio />
  </PublisherPicturesContext>,
);

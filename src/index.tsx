import { createRoot } from 'react-dom/client';
import { connect } from './bridge';
import { Studio } from './Studio';
import sheet from './ui.css';

const style = document.createElement('style');
style.textContent = sheet;
document.head.append(style);

await connect();
const root = document.createElement('div');
root.className = 'ms-root';
document.body.append(root);
createRoot(root).render(<Studio />);

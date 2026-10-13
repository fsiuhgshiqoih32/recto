import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { sampleBook } from './model/sample';
import { installAppFonts } from './preview/assets';
import { loadStartupBook } from './store/db';
import { App } from './ui/App';
// The app's own typefaces (OFL), bundled so the desktop app works offline.
import '@fontsource-variable/instrument-sans/wght.css';
import '@fontsource-variable/newsreader/opsz.css';
import '@fontsource-variable/newsreader/opsz-italic.css';
import './ui/app.css';

installAppFonts();

const book = await loadStartupBook().catch(() => undefined);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App initial={book ?? sampleBook()} />
  </StrictMode>,
);

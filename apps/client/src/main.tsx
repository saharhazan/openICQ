import './zodConfig';
import '@fontsource/source-sans-3/400.css';
import '@fontsource/source-sans-3/600.css';
import '@fontsource/source-sans-3/700.css';
import './styles/tokens.css';
import './styles/global.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { createServices } from './app/services';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const services = createServices();
createRoot(root).render(
  <StrictMode>
    <App services={services} />
  </StrictMode>,
);

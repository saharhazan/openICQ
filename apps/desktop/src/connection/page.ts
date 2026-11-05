/** The Connection Settings page script (runs sandboxed, talks only through `window.openicqConnection`). */
import { CONNECTION_GLOBAL, type ConnectionApi } from './api.ts';

const DEFAULT_PORT = 5190;

function element<T extends HTMLElement>(id: string, type: { new (): T }): T {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`Connection Settings page is missing #${id}`);
  return found;
}

// Safe: the preload script (src/preload/connection.ts) defines this object before the page runs.
const api = Reflect.get(window, CONNECTION_GLOBAL) as ConnectionApi;
const form = element('dialog', HTMLFormElement);
const host = element('mode-host', HTMLInputElement);
const connect = element('mode-connect', HTMLInputElement);
const port = element('port', HTMLInputElement);
const share = element('share', HTMLInputElement);
const server = element('server', HTMLInputElement);
const networkUrls = element('network-urls', HTMLParagraphElement);
const problem = element('problem', HTMLParagraphElement);
const ok = element('ok', HTMLButtonElement);

function showProblem(text: string | null): void {
  problem.textContent = text ?? '';
  problem.hidden = !text;
}

function syncEnabled(): void {
  port.disabled = !host.checked;
  share.disabled = !host.checked;
  server.disabled = !connect.checked;
}

function choice(): unknown {
  if (connect.checked) return { mode: 'connect', serverUrl: server.value };
  const value = /^\d+$/.test(port.value.trim()) ? Number(port.value.trim()) : Number.NaN;
  return { mode: 'host', port: value, shareOnNetwork: share.checked };
}

async function init(): Promise<void> {
  const view = await api.load();
  const config = view.config;
  host.checked = config === null || config.mode === 'host';
  connect.checked = config?.mode === 'connect';
  port.value = String(config?.mode === 'host' ? config.port : DEFAULT_PORT);
  share.checked = config?.mode === 'host' ? config.shareOnNetwork : false;
  server.value = config?.mode === 'connect' ? config.serverUrl : '';
  if (view.networkUrls.length > 0) {
    networkUrls.textContent = `Others on your network can connect to: ${view.networkUrls.join(', ')}`;
    networkUrls.hidden = false;
  }
  showProblem(view.problem);
  syncEnabled();
  (connect.checked ? server : ok).focus();
}

for (const radio of [host, connect]) radio.addEventListener('change', syncEnabled);
element('cancel', HTMLButtonElement).addEventListener('click', () => api.cancel());
element('close', HTMLButtonElement).addEventListener('click', () => api.cancel());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') api.cancel();
});
form.addEventListener('submit', (event) => {
  event.preventDefault();
  ok.disabled = true;
  api
    .save(choice())
    .then((result) => {
      if (!result.ok) showProblem(result.error);
    })
    .catch((error: unknown) => showProblem(`openICQ could not save the settings: ${String(error)}`))
    .finally(() => {
      ok.disabled = false;
    });
});

init().catch((error: unknown) => showProblem(`openICQ could not load the settings: ${String(error)}`));

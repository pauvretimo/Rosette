import type { DownloadStateChangedMessage, DownloadStateEntry } from '../../src/core/messaging/protocol';
import { callBackground } from '../../src/core/messaging/rpc';
import { LANGUAGE_OPTIONS } from '../../src/core/settings/language-options';
import { channelScopeKey } from '../../src/core/settings/settings-schema';
import { getSettings, updateSettings } from '../../src/core/settings/settings-store';
import { parseScopeFromUrl } from '../../src/adapters/discord/discord-url';

const app = document.querySelector<HTMLDivElement>('#app')!;

function languageLabel(code: string): string {
  return LANGUAGE_OPTIONS.find((opt) => opt.code === code)?.label ?? code;
}

function buildDownloadBanner(active: DownloadStateEntry[]): HTMLDivElement | null {
  if (active.length === 0) return null;

  const banner = document.createElement('div');
  banner.className = 'download-banner';

  const spinner = document.createElement('span');
  spinner.className = 'spinner';
  banner.appendChild(spinner);

  const text = document.createElement('span');
  text.textContent =
    active.length === 1
      ? `Downloading ${languageLabel(active[0].sourceLang)} → ${languageLabel(active[0].destLang)} model…`
      : `Downloading ${active.length} translation models…`;
  banner.appendChild(text);

  return banner;
}

function buildHeader(): HTMLDivElement {
  const header = document.createElement('div');
  header.className = 'header';

  const icon = document.createElement('img');
  icon.src = browser.runtime.getURL('/icon/48.png');
  icon.alt = '';
  header.appendChild(icon);

  const title = document.createElement('span');
  title.className = 'title';
  title.textContent = 'Rosette';
  header.appendChild(title);

  return header;
}

async function render() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url ? new URL(tab.url) : null;
  const scope = url && url.hostname === 'discord.com' ? parseScopeFromUrl(url) : null;

  app.innerHTML = '';
  app.appendChild(buildHeader());

  const active = await callBackground({ type: 'GET_DOWNLOAD_STATE' });
  const banner = buildDownloadBanner(active);
  if (banner) app.appendChild(banner);

  if (!scope) {
    const empty = document.createElement('p');
    empty.className = 'empty-state';
    empty.textContent = 'Open a Discord server or DM to toggle translation here.';
    app.appendChild(empty);
    return;
  }

  const settings = await getSettings();
  const serverEnabled = settings.enabledScope.servers.includes(scope.groupId);
  const channelKey = scope.subgroupId ? channelScopeKey(scope.groupId, scope.subgroupId) : null;
  const channelEnabled = channelKey ? settings.enabledScope.channels.includes(channelKey) : false;

  const serverRow = buildToggleRow(
    serverEnabled ? 'Auto-translate: whole server ON' : 'Auto-translate this whole server',
    serverEnabled,
    async () => {
      const next = new Set(settings.enabledScope.servers);
      if (serverEnabled) next.delete(scope.groupId);
      else next.add(scope.groupId);
      await updateSettings({ enabledScope: { ...settings.enabledScope, servers: [...next] } });
      render();
    },
  );
  app.appendChild(serverRow);

  if (channelKey) {
    const channelRow = buildToggleRow(
      channelEnabled ? 'Auto-translate: this channel ON' : 'Auto-translate this channel',
      channelEnabled,
      async () => {
        const next = new Set(settings.enabledScope.channels);
        if (channelEnabled) next.delete(channelKey);
        else next.add(channelKey);
        await updateSettings({ enabledScope: { ...settings.enabledScope, channels: [...next] } });
        render();
      },
    );
    app.appendChild(channelRow);
  }

  const optionsLink = document.createElement('a');
  optionsLink.className = 'options-link';
  optionsLink.href = '#';
  optionsLink.textContent = 'More settings…';
  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
  app.appendChild(optionsLink);
}

function buildToggleRow(label: string, checked: boolean, onChange: () => void): HTMLLabelElement {
  const row = document.createElement('label');
  row.className = 'toggle-row';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = checked;
  checkbox.addEventListener('change', onChange);
  row.appendChild(checkbox);

  const text = document.createElement('span');
  text.textContent = label;
  row.appendChild(text);

  return row;
}

// The download banner is the only thing that can change while the popup is sitting open (toggle
// changes already re-render on their own click handler), so a live update just re-runs render()
// rather than needing finer-grained state tracking.
browser.runtime.onMessage.addListener((message: unknown) => {
  if ((message as DownloadStateChangedMessage | undefined)?.type === 'MODEL_DOWNLOAD_STATE_CHANGED') {
    render();
  }
});

render();

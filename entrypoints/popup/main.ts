import { channelScopeKey } from '../../src/core/settings/settings-schema';
import { getSettings, updateSettings } from '../../src/core/settings/settings-store';
import { parseScopeFromUrl } from '../../src/adapters/discord/discord-url';

const app = document.querySelector<HTMLDivElement>('#app')!;

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

render();

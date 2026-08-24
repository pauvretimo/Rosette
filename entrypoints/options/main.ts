import { callBackground } from '../../src/core/messaging/rpc';
import { LANGUAGE_OPTIONS } from '../../src/core/settings/language-options';
import { getSettings, updateSettings } from '../../src/core/settings/settings-store';

const app = document.querySelector<HTMLDivElement>('#app')!;

function buildHeader(): HTMLDivElement {
  const header = document.createElement('div');
  header.className = 'header';

  const icon = document.createElement('img');
  icon.className = 'mark';
  icon.src = browser.runtime.getURL('/icon/48.png');
  icon.alt = '';
  header.appendChild(icon);

  const title = document.createElement('h1');
  title.textContent = 'Rosette settings';
  header.appendChild(title);
  return header;
}

async function render() {
  const settings = await getSettings();
  app.innerHTML = '';
  app.appendChild(buildHeader());

  // Destination language
  const destSection = document.createElement('section');
  destSection.className = 'card';
  const destLabel = document.createElement('label');
  destLabel.textContent = 'Translate into: ';
  const destSelect = document.createElement('select');
  for (const { code, label } of LANGUAGE_OPTIONS) {
    const opt = document.createElement('option');
    opt.value = code;
    opt.textContent = label;
    opt.selected = code === settings.destLang;
    destSelect.appendChild(opt);
  }
  destSelect.addEventListener('change', async () => {
    await updateSettings({ destLang: destSelect.value });
  });
  destLabel.appendChild(destSelect);
  destSection.appendChild(destLabel);
  app.appendChild(destSection);

  // Auto-translate source languages
  const srcSection = document.createElement('section');
  srcSection.className = 'card';
  const srcHeading = document.createElement('h2');
  srcHeading.textContent = 'Auto-translate messages written in';
  srcSection.appendChild(srcHeading);
  const srcHint = document.createElement('p');
  srcHint.className = 'hint';
  srcHint.textContent = 'Nothing is translated automatically unless a language is selected here AND a server or channel is enabled below.';
  srcSection.appendChild(srcHint);

  const srcList = document.createElement('div');
  srcList.className = 'checkbox-list';
  for (const { code, label } of LANGUAGE_OPTIONS) {
    if (code === settings.destLang) continue;
    const row = document.createElement('label');
    row.className = 'checkbox-row';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = settings.autoTranslateSourceLangs.includes(code);
    checkbox.addEventListener('change', async () => {
      const next = new Set(settings.autoTranslateSourceLangs);
      if (checkbox.checked) next.add(code);
      else next.delete(code);
      await updateSettings({ autoTranslateSourceLangs: [...next] });
    });
    row.appendChild(checkbox);
    row.append(label);
    srcList.appendChild(row);
  }
  srcSection.appendChild(srcList);
  app.appendChild(srcSection);

  // Enabled scope
  const scopeSection = document.createElement('section');
  scopeSection.className = 'card';
  const scopeHeading = document.createElement('h2');
  scopeHeading.textContent = 'Enabled servers & channels';
  scopeSection.appendChild(scopeHeading);
  const scopeHint = document.createElement('p');
  scopeHint.className = 'hint';
  scopeHint.textContent = 'Use the toolbar popup while on Discord to enable a server or channel with one click. Currently enabled:';
  scopeSection.appendChild(scopeHint);

  const scopeList = document.createElement('ul');
  scopeList.className = 'scope-list';
  for (const serverId of settings.enabledScope.servers) {
    scopeList.appendChild(buildScopeListItem(`Server ${serverId}`, async () => {
      const next = settings.enabledScope.servers.filter((id) => id !== serverId);
      await updateSettings({ enabledScope: { ...settings.enabledScope, servers: next } });
      render();
    }));
  }
  for (const channelKey of settings.enabledScope.channels) {
    scopeList.appendChild(buildScopeListItem(`Channel ${channelKey}`, async () => {
      const next = settings.enabledScope.channels.filter((k) => k !== channelKey);
      await updateSettings({ enabledScope: { ...settings.enabledScope, channels: next } });
      render();
    }));
  }
  if (settings.enabledScope.servers.length === 0 && settings.enabledScope.channels.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty';
    empty.textContent = 'None yet';
    scopeList.appendChild(empty);
  }
  scopeSection.appendChild(scopeList);
  app.appendChild(scopeSection);

  // Display
  const displaySection = document.createElement('section');
  displaySection.className = 'card';
  const displayHeading = document.createElement('h2');
  displayHeading.textContent = 'Display';
  displaySection.appendChild(displayHeading);
  const showOriginalLabel = document.createElement('label');
  showOriginalLabel.className = 'display-toggle';
  const showOriginalCheckbox = document.createElement('input');
  showOriginalCheckbox.type = 'checkbox';
  showOriginalCheckbox.checked = settings.showOriginalSubtext;
  showOriginalCheckbox.addEventListener('change', async () => {
    await updateSettings({ showOriginalSubtext: showOriginalCheckbox.checked });
  });
  showOriginalLabel.appendChild(showOriginalCheckbox);
  showOriginalLabel.append('Show original text under the translation');
  displaySection.appendChild(showOriginalLabel);
  app.appendChild(displaySection);

  // Cache
  const cacheSection = document.createElement('section');
  cacheSection.className = 'card';
  const cacheHeading = document.createElement('h2');
  cacheHeading.textContent = 'Cache';
  cacheSection.appendChild(cacheHeading);
  const clearButton = document.createElement('button');
  clearButton.className = 'btn-primary';
  clearButton.textContent = 'Clear translation cache';
  clearButton.addEventListener('click', async () => {
    clearButton.disabled = true;
    clearButton.textContent = 'Clearing…';
    await callBackground({ type: 'CACHE_CLEAR' });
    clearButton.textContent = 'Cleared';
    setTimeout(() => {
      clearButton.disabled = false;
      clearButton.textContent = 'Clear translation cache';
    }, 1500);
  });
  cacheSection.appendChild(clearButton);
  app.appendChild(cacheSection);
}

function buildScopeListItem(label: string, onRemove: () => void): HTMLLIElement {
  const item = document.createElement('li');
  const text = document.createElement('span');
  text.textContent = label;
  item.appendChild(text);
  const removeButton = document.createElement('button');
  removeButton.className = 'btn-danger';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', onRemove);
  item.appendChild(removeButton);
  return item;
}

render();

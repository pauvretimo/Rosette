import { DEFAULT_SETTINGS, type RosetteSettings } from './settings-schema';

const STORAGE_KEY = 'rosetteSettings';

export async function getSettings(): Promise<RosetteSettings> {
  const stored = await browser.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY] as Partial<RosetteSettings> | undefined;
  return { ...DEFAULT_SETTINGS, ...value };
}

export async function updateSettings(patch: Partial<RosetteSettings>): Promise<RosetteSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await browser.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

/**
 * Keeps an in-memory copy of settings hydrated via storage.onChanged, for contexts (like the
 * content script) that need to read settings synchronously many times per second without an
 * async round trip on every message.
 */
export class SettingsCache {
  private value: RosetteSettings = DEFAULT_SETTINGS;
  private ready: Promise<void>;
  private listeners = new Set<() => void>();

  constructor() {
    this.ready = getSettings().then((v) => {
      this.value = v;
    });
    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const change = changes[STORAGE_KEY];
      if (!change) return;
      this.value = { ...DEFAULT_SETTINGS, ...(change.newValue as Partial<RosetteSettings>) };
      this.listeners.forEach((listener) => listener());
    });
  }

  async whenReady(): Promise<void> {
    return this.ready;
  }

  get current(): RosetteSettings {
    return this.value;
  }

  /** Called whenever settings change (e.g. the user enables a server/channel from the popup),
   *  so callers can re-evaluate anything that was previously gated on the old settings —
   *  content already on screen doesn't get re-checked automatically otherwise. */
  onChange(listener: () => void): void {
    this.listeners.add(listener);
  }
}

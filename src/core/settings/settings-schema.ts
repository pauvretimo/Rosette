export interface RosetteSettings {
  /** BCP-47-ish language code, e.g. "en". */
  destLang: string;
  /** Source languages that get auto-translated. Empty = auto-translate fully off. */
  autoTranslateSourceLangs: string[];
  enabledScope: {
    /** Guild (server) ids fully enabled — every channel in the server auto-translates. */
    servers: string[];
    /** `${guildId}:${channelId}` explicitly enabled, independent of server-level scope. */
    channels: string[];
  };
  /** Show the original text under the translation in a smaller font. */
  showOriginalSubtext: boolean;
  /** Epoch ms of the last successful models.json registry fetch. */
  modelRegistryFetchedAt: number;
}

export const DEFAULT_SETTINGS: RosetteSettings = {
  destLang: 'en',
  autoTranslateSourceLangs: [],
  enabledScope: { servers: [], channels: [] },
  showOriginalSubtext: true,
  modelRegistryFetchedAt: 0,
};

export function channelScopeKey(guildId: string, channelId: string): string {
  return `${guildId}:${channelId}`;
}

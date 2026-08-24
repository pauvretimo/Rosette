import { channelScopeKey, type RosetteSettings } from './settings-schema';

export interface ScopeIds {
  groupId: string;
  subgroupId?: string;
}

/** Coarse check: is this server/channel opted into auto-translation at all? Cheap, synchronous. */
export function isScopeEnabled(scope: ScopeIds, settings: RosetteSettings): boolean {
  if (settings.enabledScope.servers.includes(scope.groupId)) return true;
  if (scope.subgroupId && settings.enabledScope.channels.includes(channelScopeKey(scope.groupId, scope.subgroupId))) {
    return true;
  }
  return false;
}

/** Fine-grained check, run once a language has been detected. */
export function isLanguageEnabled(detectedLang: string, settings: RosetteSettings): boolean {
  return settings.autoTranslateSourceLangs.includes(detectedLang);
}

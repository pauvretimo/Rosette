import type { ScopeIds } from '../../core/settings/scope-matcher';

const CHANNEL_ROUTE = /^\/channels\/(?<guildId>[^/]+)\/(?<channelId>[^/]+)/;

/** Parses `/channels/<guildId>/<channelId>[/<messageId>]` (guildId is "@me" for DMs). This
 *  route pattern has been stable for Discord's whole web-app history, unlike the DOM below it. */
export function parseScopeFromUrl(url: URL): ScopeIds | null {
  const match = CHANNEL_ROUTE.exec(url.pathname);
  if (!match?.groups) return null;
  return { groupId: match.groups.guildId, subgroupId: match.groups.channelId };
}

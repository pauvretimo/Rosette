/**
 * Discord DOM selectors, keyed off `id`/`data-*`/`role` attributes only — never CSS module class
 * names, which Discord regenerates on every deploy.
 *
 * Verified against a live discord.com session's DOM on 2026-08-19 (user-supplied outerHTML
 * captures of the message list and the message context menu).
 */

/** The virtualized message list's scroll container. */
export const MESSAGES_LIST_SELECTOR = 'ol[data-list-id="chat-messages"]';

/** One message row. `id` format: chat-messages-<channelId>-<messageId>. */
export const MESSAGE_ROW_SELECTOR = 'li[id^="chat-messages-"]';
const MESSAGE_ROW_ID_PATTERN = /^chat-messages-(?<channelId>\d+)-(?<messageId>\d+)$/;

/**
 * The rendered markdown content within a message row. `id` format: message-content-<messageId>.
 *
 * A reply message's row contains a SECOND element matching this same `id^=` prefix: a hidden
 * (`display: none`) quoted-preview copy of the *original* message being replied to, carrying
 * that original message's own id — not the row's. A generic prefix match picks whichever comes
 * first in DOM order (the hidden quote), silently operating on the wrong element entirely.
 * Always resolve the exact id via `messageContentSelector(messageId)` instead of this prefix
 * pattern when a specific row's own content is what's wanted (which is every call site in this
 * adapter) — the prefix form is kept only for detecting "is there a message here at all".
 */
export const MESSAGE_CONTENT_SELECTOR = '[id^="message-content-"]';

export function messageContentSelector(messageId: string): string {
  return `#message-content-${messageId}`;
}

/** The per-message right-click menu Discord renders into its popover portal. `id="message"` is
 *  Discord's own semantic name for this menu (not a hashed class), same category of stability
 *  as the ids above. */
export const MESSAGE_CONTEXT_MENU_SELECTOR = 'div[role="menu"]#message';

export function parseMessageRowId(id: string): { channelId: string; messageId: string } | null {
  const match = MESSAGE_ROW_ID_PATTERN.exec(id);
  return match?.groups ? { channelId: match.groups.channelId, messageId: match.groups.messageId } : null;
}

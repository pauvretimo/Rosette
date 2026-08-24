import type { LanguageOption } from '../../core/settings/language-options';
import type { ScopeIds } from '../../core/settings/scope-matcher';
import type { SiteAdapter } from '../../core/site-adapter';
import type { ExtractedMessage, TranslateResult } from '../../core/translation/types';
import './discord-styles.css';
import { parseScopeFromUrl } from './discord-url';
import {
  MESSAGE_CONTEXT_MENU_SELECTOR,
  MESSAGE_ROW_SELECTOR,
  MESSAGES_LIST_SELECTOR,
  messageContentSelector,
  parseMessageRowId,
} from './discord-selectors';

const CONTAINER_CLASS = 'rosette-translation-container';
const CONTEXT_MENU_ITEM_CLASS = 'rosette-context-menu-item';

export class DiscordAdapter implements SiteAdapter {
  id = 'discord';

  matches(url: URL): boolean {
    return url.hostname === 'discord.com' && url.pathname.startsWith('/channels/');
  }

  getScopeIds(url: URL): ScopeIds {
    return parseScopeFromUrl(url) ?? { groupId: 'unknown' };
  }

  observe(onMessageMounted: (msg: ExtractedMessage) => void): () => void {
    const processed = new WeakSet<Element>();

    const scanForNewRows = (root: ParentNode) => {
      const rows = root.querySelectorAll(MESSAGE_ROW_SELECTOR);
      for (const row of rows) {
        if (processed.has(row)) continue;
        processed.add(row);
        const msg = this.extractMessage(row);
        if (msg) onMessageMounted(msg);
      }
    };

    let scheduled = false;
    const scheduleRescan = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        scanForNewRows(document);
      });
    };

    const observer = new MutationObserver(() => scheduleRescan());
    observer.observe(document.body, { childList: true, subtree: true });

    // Initial scan in case the list is already populated (e.g. content script injected after
    // the SPA had already rendered the current channel).
    scanForNewRows(document);

    return () => observer.disconnect();
  }

  extractMessage(element: Element): ExtractedMessage | null {
    const row = element.matches(MESSAGE_ROW_SELECTOR) ? element : element.closest(MESSAGE_ROW_SELECTOR);
    if (!row || !row.id) return null;

    const parsedId = parseMessageRowId(row.id);
    if (!parsedId) return null;

    // Keyed to this row's own message id, not a generic prefix match — a reply message's row
    // also contains a hidden (display:none) quoted-preview copy of the *original* message being
    // replied to, carrying that original message's id. A prefix match can silently grab that
    // hidden, wrong-message element instead of the row's own content.
    const contentEl = row.querySelector(messageContentSelector(parsedId.messageId));
    const text = contentEl?.textContent?.trim();
    if (!text) return null; // system messages, embed-only messages, etc.

    const scope = parseScopeFromUrl(new URL(window.location.href));
    const guildId = scope?.groupId ?? 'unknown';

    return {
      id: parsedId.messageId,
      groupId: guildId,
      subgroupId: parsedId.channelId,
      text,
      element: row,
    };
  }

  /**
   * Inserted as a sibling immediately after the (now-hidden) original text, inside the same
   * wrapper that holds it — not appended to the outer message row. Discord's reactions live in
   * a separate `message-accessories` sibling that follows that wrapper, so appending to the row
   * itself would visually place our content after reactions instead of in the text's own slot.
   */
  private getOrCreateContainer(msg: ExtractedMessage): HTMLDivElement {
    let container = msg.element.querySelector<HTMLDivElement>(`.${CONTAINER_CLASS}`);
    if (!container) {
      container = document.createElement('div');
      container.className = CONTAINER_CLASS;
      const contentEl = msg.element.querySelector(messageContentSelector(msg.id));
      if (contentEl) {
        contentEl.insertAdjacentElement('afterend', container);
      } else {
        msg.element.appendChild(container);
      }
    }
    return container;
  }

  /**
   * Hides Discord's own rendered message text via a direct inline style rather than a CSS
   * class — Discord's className on this element is fully React-controlled and would get reset
   * on the next re-render (e.g. a reaction update), silently un-hiding the original, but it
   * doesn't manage `style` there, so a direct mutation persists across re-renders like our own
   * appended sibling nodes do.
   */
  private setOriginalContentVisible(msg: ExtractedMessage, visible: boolean): void {
    const contentEl = msg.element.querySelector<HTMLElement>(messageContentSelector(msg.id));
    if (contentEl) contentEl.style.display = visible ? '' : 'none';
  }

  injectTranslation(msg: ExtractedMessage, result: TranslateResult, showOriginalSubtext: boolean): void {
    this.setOriginalContentVisible(msg, false);

    const container = this.getOrCreateContainer(msg);
    container.textContent = '';

    const translated = document.createElement('div');
    translated.className = 'rosette-translated';
    translated.textContent = result.translatedText;
    container.appendChild(translated);

    if (showOriginalSubtext) {
      const original = document.createElement('div');
      original.className = 'rosette-original';
      original.textContent = msg.text;
      container.appendChild(original);
    }
  }

  injectStatus(msg: ExtractedMessage, text: string): void {
    const container = this.getOrCreateContainer(msg);
    container.textContent = '';
    const status = document.createElement('div');
    status.className = 'rosette-status';
    status.textContent = text;
    container.appendChild(status);

    setTimeout(() => {
      // Only clean up if nothing else (a real translation) has taken over the container since.
      if (container.querySelector('.rosette-status')) container.remove();
    }, 3500);
  }

  injectLanguagePicker(msg: ExtractedMessage, options: LanguageOption[], onPick: (code: string) => void): void {
    const container = this.getOrCreateContainer(msg);
    container.textContent = '';

    const picker = document.createElement('div');
    picker.className = 'rosette-lang-picker';

    const label = document.createElement('span');
    label.className = 'rosette-lang-picker-label';
    label.textContent = "Rosette couldn't detect this message's language — what is it?";
    picker.appendChild(label);

    const row = document.createElement('div');
    row.className = 'rosette-lang-picker-row';

    const select = document.createElement('select');
    select.className = 'rosette-lang-picker-select';
    for (const { code, label: optionLabel } of options) {
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = optionLabel;
      select.appendChild(opt);
    }
    row.appendChild(select);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'rosette-lang-picker-button';
    button.textContent = 'Translate';
    button.addEventListener('click', () => onPick(select.value));
    row.appendChild(button);

    picker.appendChild(row);
    container.appendChild(picker);
  }

  removeTranslation(msg: ExtractedMessage): void {
    this.setOriginalContentVisible(msg, true);
    msg.element.querySelector(`.${CONTAINER_CLASS}`)?.remove();
  }

  /**
   * Discord renders its own message context menu into a shared popover portal and blocks the
   * browser's native context menu (calls preventDefault on `contextmenu`), so there's no way to
   * add a native `browser.contextMenus` entry that would actually show on a plain right-click —
   * only Shift+Right-click bypasses that. Injecting straight into Discord's own menu instead.
   *
   * Rather than hardcoding Discord's hashed CSS classes (which rotate every deploy), this clones
   * a real existing menu item at injection time and swaps its label/icon — so our item always
   * matches whatever Discord's *current* build actually looks like, instead of going visually
   * stale the next time their classes change.
   */
  observeManualTranslateRequests(onRequest: (msg: ExtractedMessage) => void): () => void {
    let lastRightClickedRow: Element | null = null;
    const onContextMenu = (event: Event) => {
      const target = event.target as Element | null;
      lastRightClickedRow = target?.closest(MESSAGE_ROW_SELECTOR) ?? null;
    };
    document.addEventListener('contextmenu', onContextMenu, true);

    // Discord's menu almost certainly delegates clicks from a single listener higher up
    // (probably keyed off the original item's id, which we deliberately stripped), rather than
    // each item owning its own handler — a listener on our own cloned node never actually gets
    // reached, since the delegated handler either intercepts the event first or nothing
    // recognizes our node at all. A capture-phase listener on `document` runs before any
    // listener attached to a descendant (the menu, the item, wherever Discord's own listener
    // lives), so this gets first refusal on the click and can stop it from reaching — and
    // potentially confusing — Discord's own handling.
    const onDocumentClick = (event: Event) => {
      const target = event.target as Element | null;
      const item = target?.closest(`.${CONTEXT_MENU_ITEM_CLASS}`);
      if (!item) return;
      // Deliberately does NOT stop propagation or preventDefault: doing so also blocked
      // Discord's own generic "clicking any menu item closes the menu" behavior, since that
      // almost certainly comes from the same delegated handler this was meant to route around —
      // the translation was actually succeeding, just invisible behind the menu that never
      // closed. Letting the event continue costs nothing since our item has no href/default
      // action for Discord's handler to misinterpret (no recognized id, nothing to activate).
      const row = lastRightClickedRow;
      if (!row) return;
      const msg = this.extractMessage(row);
      if (msg) onRequest(msg);
    };
    document.addEventListener('click', onDocumentClick, true);

    const injectMenuItem = (menu: Element) => {
      if (menu.querySelector(`.${CONTEXT_MENU_ITEM_CLASS}`)) return; // idempotent

      // The menu's *first* group is a quick-react emoji row (plain image button, no label, no
      // svg) — cloning that silently produces an unlabeled item, since there's no
      // [data-text-variant] span or <svg> to swap. Target a group that actually contains a
      // properly labeled item (e.g. "Reply") instead.
      const referenceItem = menu.querySelector('[role="menuitem"]:has([data-text-variant])');
      const referenceGroup = referenceItem?.closest('[role="group"]');
      const scroller = menu.firstElementChild; // the scrollable list wrapping the groups
      if (!referenceGroup || !referenceItem || !scroller) {
        // eslint-disable-next-line no-console
        console.warn('[rosette] context menu shape not recognized', {
          hasGroup: !!referenceGroup,
          hasItem: !!referenceItem,
          hasScroller: !!scroller,
          menuOuterHTML: menu.outerHTML.slice(0, 300),
        });
        return;
      }

      const item = referenceItem.cloneNode(true) as HTMLElement;
      item.classList.add(CONTEXT_MENU_ITEM_CLASS);
      item.removeAttribute('id');
      item.removeAttribute('aria-expanded');
      item.removeAttribute('aria-haspopup');
      // Inline styles (not classes) so the theme colors win regardless of Discord's own class
      // specificity — this item should read as ours, not blend in as a native Discord entry.
      item.style.setProperty('color', '#8fd9ff', 'important');
      item.style.setProperty(
        'background',
        'linear-gradient(90deg, rgba(255,95,109,0.10), rgba(79,172,254,0.10), rgba(161,127,224,0.10))',
        'important',
      );

      const label = item.querySelector('[data-text-variant]');
      if (label) {
        label.textContent = 'Translate message';
        (label as HTMLElement).style.setProperty('color', '#8fd9ff', 'important');
      }

      // The reference item is a submenu trigger ("Add reaction"), so it carries a caret icon in
      // its own icon slot in addition to the main one — remove it, since our item has no
      // submenu and the caret would misleadingly imply one.
      const icons = item.querySelectorAll('svg');
      icons.forEach((svg, index) => {
        if (index === 0) {
          svg.outerHTML =
            '<span aria-hidden="true" style="font-size: 16px; line-height: 1; filter: drop-shadow(0 0 3px rgba(143, 217, 255, 0.6));">🌐</span>';
        } else {
          svg.closest('div')?.remove();
        }
      });

      const group = referenceGroup.cloneNode(false) as HTMLElement;
      group.appendChild(item);
      scroller.insertBefore(group, scroller.firstChild);

      const separator = menu.querySelector('[role="separator"]');
      if (separator) scroller.insertBefore(separator.cloneNode(false), group.nextSibling);
    };

    // Deliberately re-checks the whole document on every mutation rather than inspecting just
    // the freshly-added nodes: Discord's floating-ui-based menu can mount its container and
    // populate it in separate steps, and may reuse the same container across multiple opens
    // (React swapping its children rather than the container itself being re-added) — in both
    // cases the mutated nodes are the menu's *children*, never the menu element itself, so
    // matching only against addedNodes silently never finds it.
    const observer = new MutationObserver(() => {
      const menu = document.querySelector(MESSAGE_CONTEXT_MENU_SELECTOR);
      if (menu) injectMenuItem(menu);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('click', onDocumentClick, true);
      observer.disconnect();
    };
  }

  runHealthCheck(): boolean {
    return document.querySelector(MESSAGES_LIST_SELECTOR) !== null && document.querySelector(MESSAGE_ROW_SELECTOR) !== null;
  }
}

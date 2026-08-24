const NOTIFIED_VERSION_KEY = 'rosetteHealthCheckNotifiedVersion';

/**
 * Runs in the background context. Sets a warning badge and fires one notification per
 * extension version so a Discord redesign that breaks our selectors fails loudly instead of
 * silently — see discord-adapter.ts's runHealthCheck for the detection side. Also clears the
 * badge on a later successful check, since Discord is a SPA and the same tab can go from "no
 * messages visible yet" to healthy without a page reload.
 */
export async function reportAdapterHealthCheck(adapterId: string, ok: boolean, details: string): Promise<void> {
  if (ok) {
    await browser.action.setBadgeText({ text: '' });
    return;
  }

  await browser.action.setBadgeText({ text: '!' });
  await browser.action.setBadgeBackgroundColor({ color: '#dc2626' });

  const currentVersion = browser.runtime.getManifest().version;
  const stored = await browser.storage.local.get(NOTIFIED_VERSION_KEY);
  if (stored[NOTIFIED_VERSION_KEY] === currentVersion) return; // already notified this version

  await browser.storage.local.set({ [NOTIFIED_VERSION_KEY]: currentVersion });
  await browser.notifications.create({
    type: 'basic',
    iconUrl: browser.runtime.getURL('/icon/128.png'),
    title: 'Rosette can\'t find Discord\'s messages',
    message: `The "${adapterId}" adapter's selectors didn't match the page — Discord may have changed their layout. Translations are paused until this is fixed. (${details})`,
  });
}

// Help → Check for Updates: asks GitHub for the latest release, only when the
// author chooses to. Recto never checks on its own (it sends nothing anywhere
// unasked), and Microsoft Store copies update through the Store.

import { type BrowserWindow, app, dialog, net, shell } from 'electron';

const REPO = 'fsiuhgshiqoih32/recto';
const RELEASES_API = process.env.RECTO_RELEASES_URL ?? `https://api.github.com/repos/${REPO}/releases/latest`;
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

/** 1.10.0 > 1.9.2; pre-release tags (1.2.0-beta.1) count as older than the release. */
export function isNewer(latest: string, current: string): boolean {
  const parse = (v: string) => {
    const [core, pre] = v.replace(/^v/, '').split('-', 2);
    return { parts: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre: !!pre };
  };
  const a = parse(latest);
  const b = parse(current);
  for (let i = 0; i < 3; i++) {
    if ((a.parts[i] ?? 0) !== (b.parts[i] ?? 0)) return (a.parts[i] ?? 0) > (b.parts[i] ?? 0);
  }
  return b.pre && !a.pre;
}

export async function checkForUpdates(window: BrowserWindow | null): Promise<void> {
  const show = (options: Electron.MessageBoxOptions) => (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
  const current = app.getVersion();
  if (process.windowsStore) {
    await show({ type: 'info', title: 'Check for Updates', message: `Recto ${current}`, detail: 'This copy came from the Microsoft Store, which keeps it up to date.' });
    return;
  }
  let release: { tag_name?: string; html_url?: string; name?: string };
  try {
    const response = await net.fetch(RELEASES_API, { headers: { accept: 'application/vnd.github+json', 'user-agent': `Recto/${current}` } });
    if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
    release = (await response.json()) as typeof release;
  } catch (error) {
    await show({ type: 'warning', title: 'Check for Updates', message: 'Recto couldn’t reach GitHub.', detail: `${error instanceof Error ? error.message : String(error)}\n\nCheck your connection, or visit ${RELEASES_PAGE}.` });
    return;
  }
  const latest = (release.tag_name ?? '').replace(/^v/, '');
  if (!latest || !isNewer(latest, current)) {
    await show({ type: 'info', title: 'Check for Updates', message: 'Recto is up to date.', detail: `You have version ${current}, the latest release.` });
    return;
  }
  const { response } = await show({
    type: 'info',
    title: 'Check for Updates',
    message: `Recto ${latest} is available.`,
    detail: `You have version ${current}. The download page has installers for Windows, macOS and Linux. Your books stay as they are.`,
    buttons: ['Open Download Page', 'Later'],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) await shell.openExternal(release.html_url?.startsWith('https://github.com/') ? release.html_url : RELEASES_PAGE);
}

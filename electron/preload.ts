// The only bridge between the sandboxed app and the desktop shell.
// Mirrors the RectoDesktop interface in src/desktop.ts.

import { type IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';

const listen =
  (channel: string) =>
  (callback: (value: unknown) => void): (() => void) => {
    const handler = (_event: IpcRendererEvent, value: unknown) => callback(value);
    ipcRenderer.on(channel, handler);
    return () => {
      ipcRenderer.removeListener(channel, handler);
    };
  };

contextBridge.exposeInMainWorld('rectoDesktop', {
  platform: process.platform,
  setSpellcheckLanguages: (codes: string[]) => ipcRenderer.invoke('spellcheck:set-languages', codes),
  layoutPdf: (html: string) => ipcRenderer.invoke('pdf:layout', html),
  savePdf: (fileName: string) => ipcRenderer.invoke('pdf:save', fileName),
  cancelPdf: () => ipcRenderer.invoke('pdf:cancel'),
  takePendingFile: () => ipcRenderer.invoke('file:take-pending'),
  onOpenFile: listen('file:open'),
  onMenu: listen('menu'),
});

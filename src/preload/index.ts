/**
 * preload — runs in the isolated preload context (sandboxed). Must stay
 * zero-dependency: only `electron`'s contextBridge plus globals. The renderer
 * is a self-contained web app (localStorage persistence); it needs nothing
 * from main except a way to know it's running on desktop.
 */
import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('cashflowDesktop', {
  platform: process.platform,
  isDesktop: true,
});

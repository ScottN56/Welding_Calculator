import { getDefaultStore } from './localStore';

/** Single app-wide store. localStorage persists inside the Capacitor WebView. */
export const appStore = getDefaultStore();

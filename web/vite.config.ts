/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';
import { minimal2023Preset, type Preset } from '@vite-pwa/assets-generator/config';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA, type VitePWAOptions } from 'vite-plugin-pwa';
import ru from './src/shared/i18n/locales/ru.json' with { type: 'json' };

// The backend listens on 8080 locally; override with BACKEND_URL if it runs elsewhere.
const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:8080';

// ---------------------------------------------------------------------------
// PWA (spec #5, PWA)
// ---------------------------------------------------------------------------

// The installed app's name comes from the ru i18n file, so the manifest and index.html follow I2.
const APP_NAME = ru.app.name;
// The calm accent of the icon, used for the browser and status bar.
const THEME_COLOR = '#2f7f73';
// Warm off-white behind the splash screen and the maskable/Apple icons.
const BACKGROUND_COLOR = '#f6f4ef';

// Every icon is exported at build time from the one SVG source: transparent 64/192/512,
// maskable 512, apple-touch-icon 180 and favicon.ico. Maskable and Apple icons sit on the app
// background, padded so the house stays inside the platform mask.
const iconPreset: Preset = {
  ...minimal2023Preset,
  maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: BACKGROUND_COLOR } },
  apple: { ...minimal2023Preset.apple, resizeOptions: { background: BACKGROUND_COLOR } },
};

/**
 * Updates: the new service worker installs in the background, skips waiting and takes over. The
 * page that is already open keeps running the code it loaded and is never reloaded under the
 * Member's hands; the next launch loads the new shell. That is "auto-update on next launch"
 * without a prompt.
 *
 * The service worker only precaches the built app shell. It has no runtime caching, and
 * navigations under /api and /actuator are never answered with the cached shell, so the API is
 * always fetched from the network.
 */
const pwaOptions: Partial<VitePWAOptions> = {
  registerType: 'autoUpdate',
  injectRegister: 'script-defer',
  manifest: {
    name: APP_NAME,
    short_name: APP_NAME,
    lang: 'ru',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: THEME_COLOR,
    background_color: BACKGROUND_COLOR,
    // Icons are filled in by pwaAssets below.
  },
  pwaAssets: {
    config: false,
    image: 'public/icon.svg',
    preset: iconPreset,
    htmlPreset: '2023',
    overrideManifestIcons: true,
  },
  workbox: {
    // The manifest is added by the plugin itself.
    globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
    navigateFallback: 'index.html',
    navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/actuator(\/|$)/],
    cleanupOutdatedCaches: true,
    clientsClaim: true,
    skipWaiting: true,
  },
};

/** Replaces the %APP_NAME% placeholder in index.html with the name from the ru i18n file. */
function appNameInHtml(): Plugin {
  return {
    name: 'family-app:app-name-in-html',
    transformIndexHtml: (html) => html.replaceAll('%APP_NAME%', APP_NAME),
  };
}

export default defineConfig({
  plugins: [react(), appNameInHtml(), VitePWA(pwaOptions)],
  resolve: {
    // Mirrors tsconfig "paths". Cross-folder imports use it (M3, see eslint.config.js).
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    proxy: {
      '/api': { target: backendUrl },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});

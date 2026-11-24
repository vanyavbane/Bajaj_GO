// @ts-nocheck — @types/node не установлен; сборка Vite типы Node не проверяет.
import { cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const adManagerDir = fileURLToPath(new URL('./AdManager', import.meta.url));
const soundsDir = fileURLToPath(new URL('./sounds', import.meta.url));

// AdManager/ лежит рядом с исходным index.html и должна оказаться рядом
// с собранным dist/bajaj-go.html: владелец кладёт туда свои файлы.
function copyAdManager() {
  /** @type {import('vite').ResolvedConfig | null} */
  let config = null;
  return {
    name: 'bajaj-go-copy-admanager',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      if (!config || !existsSync(adManagerDir)) return;
      const outDir = resolve(config.root, config.build.outDir);
      cpSync(adManagerDir, join(outDir, 'AdManager'), { recursive: true });
    },
  };
}

// sounds/ лежит рядом со собранной игрой: владелец заменяет MP3, не трогая HTML.
function copySounds() {
  /** @type {import('vite').ResolvedConfig | null} */
  let config = null;
  return {
    name: 'bajaj-go-copy-sounds',
    apply: 'build',
    configResolved(resolved) {
      config = resolved;
    },
    closeBundle() {
      if (!config || !existsSync(soundsDir)) return;
      const outDir = resolve(config.root, config.build.outDir);
      cpSync(soundsDir, join(outDir, 'sounds'), { recursive: true });
    },
  };
}

export default defineConfig(({ command }) => ({
  define: {
    __BUILD_TIME__: JSON.stringify(command === 'build' ? new Date().toISOString() : ''),
  },
  plugins: [
    viteSingleFile({ useRecommendedBuildConfig: true, outputFileName: 'bajaj-go.html' }),
    copyAdManager(),
    copySounds(),
  ],
  server: {
    port: 5173,
    strictPort: false,
    // В каталоге проекта работают инструменты с собственным профилем браузера
    // (.tmp-build/bajaj-probe-*): Windows держит его файлы залоченными,
    // и вотчер падает с EBUSY, убивая dev-сервер.
    watch: {
      ignored: ['**/.tmp-build/**', '**/dist/**'],
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
}));

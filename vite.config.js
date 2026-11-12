// @ts-nocheck — @types/node не установлен; сборка Vite типы Node не проверяет.
import { cpSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const adManagerDir = fileURLToPath(new URL('./AdManager', import.meta.url));

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

export default defineConfig({
  plugins: [
    viteSingleFile({ useRecommendedBuildConfig: true, outputFileName: 'bajaj-go.html' }),
    copyAdManager(),
  ],
  server: {
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000,
  },
});

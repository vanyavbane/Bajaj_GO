/** Инструменты отладки сцены: Vite в разработке или страница с `?debug`. */
export function devToolsEnabled() {
  const env = import.meta.env;
  if (env && env.DEV) return true;
  return new URLSearchParams(location.search).has('debug');
}

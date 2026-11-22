import '@shoelace-style/shoelace/dist/components/icon/icon.js';
import { registerIconLibrary } from '@shoelace-style/shoelace/dist/utilities/icon-library.js';

/**
 * Иконки интерфейса — Bootstrap Icons из поставки Shoelace.
 * В сборку попадают только перечисленные файлы, без запросов к CDN:
 * одиночный HTML игры должен открываться офлайн.
 */
const files = import.meta.glob(
  '../../node_modules/@shoelace-style/shoelace/dist/assets/icons/{arrow-counterclockwise,arrow-down,arrow-left,arrow-left-right,arrow-right,arrow-up,arrows-fullscreen,backpack,bandaid,basket,basket2,buildings,bullseye,cake,cake2,camera-video,cart3,check-lg,circle,cup-hot,droplet,egg-fried,ev-front,exclamation-triangle-fill,flower1,fuel-pump,funnel,gear,geo-alt,hospital,hourglass-split,joystick,lightbulb,lightbulb-fill,lightning-charge,link-45deg,moisture,moon,pause-fill,play-fill,rocket-takeoff,screwdriver,signpost-split,sliders,stop-circle,sun,sunset,tools,train-front,tree,truck-front,vinyl,water,wind,wrench,x-lg}.svg',
  { eager: true, query: '?raw', import: 'default' }
);

/** @type {Record<string, string>} */
const svgByName = {};
for (const [path, svg] of Object.entries(files)) {
  const name = path.slice(path.lastIndexOf('/') + 1, -4);
  svgByName[name] = svg;
}

const urls = new Map();

function urlFor(name) {
  const cached = urls.get(name);
  if (cached) return cached;
  const svg = svgByName[name];
  if (!svg) return '';
  const url = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  urls.set(name, url);
  return url;
}

registerIconLibrary('default', {
  resolver: (name) => urlFor(name),
  mutator: (svg) => {
    svg.setAttribute('fill', 'currentColor');
    svg.removeAttribute('width');
    svg.removeAttribute('height');
  }
});

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @param {string} name @param {string} [label] */
export function icon(name, label = '') {
  const labelled = label ? ` label="${esc(label)}"` : '';
  return `<sl-icon name="${esc(name)}"${labelled}></sl-icon>`;
}

/** Контуры для холста: Path2D рисует ту же фигуру, что и sl-icon. @param {string} name */
export function iconPaths(name) {
  const svg = svgByName[name] || '';
  return [...svg.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]);
}

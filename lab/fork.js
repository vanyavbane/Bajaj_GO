import { FORK_LEAD, sampleRoad } from '../js/engine/fork.ts';

const ns = 'http://www.w3.org/2000/svg';
const D_MIN = -40;
const D_MAX = 520;
const LAT_MIN = -46;
const LAT_MAX = 64;

const el = (id) => document.getElementById(id);
const num = (id) => Number(el(id).value);

function smooth(v) {
  const t = Math.max(0, Math.min(1, v));
  return t * t * (3 - 2 * t);
}

function read() {
  return {
    d: num('d'),
    lat: num('lat'),
    choice: Number(document.querySelector('.choice button[aria-pressed="true"]').dataset.choice),
    weight: num('weight'),
    half: num('half'),
    arrive: num('arrive'),
    diverge: num('diverge'),
    hold: num('hold'),
    gap: num('gap'),
    runoff: num('runoff'),
    ease: num('ease'),
  };
}

function showOutputs(state) {
  const pairs = [
    ['d', state.d.toFixed(0)],
    ['lat', state.lat.toFixed(1)],
    ['weight', state.weight.toFixed(2)],
    ['half', state.half.toFixed(1)],
    ['arrive', state.arrive.toFixed(1)],
    ['diverge', state.diverge.toFixed(0)],
    ['hold', state.hold.toFixed(0)],
    ['gap', state.gap.toFixed(0)],
    ['runoff', state.runoff.toFixed(0)],
    ['ease', state.ease.toFixed(0)],
  ];
  for (const [id, text] of pairs) el(`${id}-out`).textContent = text;
}

/** Кадр игры. За концом рецепта — обычная дорога новой зоны, центр на нуле. */
function gameSpan(d, state) {
  if (d >= FORK_LEAD) {
    const half = state.choice === 1 ? state.arrive : state.half;
    return [{ left: -half, right: half, live: true }];
  }
  const frame = sampleRoad({
    forkDistance: d,
    half: state.half,
    chosen: state.choice,
    baseOrigin: 0,
    endWeight: state.weight,
    arriveHalf: state.choice === 1 ? state.arrive : undefined,
  });
  const edges = frame.local;
  const spans = [];
  if (edges.leftInner - edges.leftOuter > 0.05) {
    spans.push({ left: edges.leftOuter, right: edges.leftInner, live: true });
  }
  if (edges.rightOuter - edges.rightInner > 0.05) {
    spans.push({ left: edges.rightInner, right: edges.rightOuter, live: true });
  }
  return spans;
}

/**
 * Две дороги одной ширины. Оси расходятся на `gap`.
 * Выбор жив только на окне. Проигравшая дорога держит ширину ещё `runoff` метров,
 * потом перестаёт рисоваться. Победитель садится на ноль за `ease` метров.
 */
function proposedSpan(d, state) {
  const windowEnd = state.diverge + state.hold;
  const open = d <= 0 ? 0 : smooth(Math.min(1, d / state.diverge));
  const left0 = -state.gap * 0.5 * open;
  const right0 = state.gap * 0.5 * open;
  const after = Math.max(0, d - windowEnd);
  const easeU = smooth(Math.min(1, after / Math.max(1, state.ease)));
  const decided = state.choice === 0 ? 0 : 1;
  const kill = decided === 0 ? 0 : smooth(Math.min(1, Math.max(0, after - state.runoff) / 40));
  const half = state.half + (state.arrive - state.half) * (state.choice === 0 ? 0 : easeU);
  const roads = [
    { center: left0, side: -1 },
    { center: right0, side: 1 },
  ];
  return roads.map((road) => {
    const winner = state.choice === 0 || state.choice === road.side;
    const center = winner && decided ? road.center * (1 - easeU) : road.center;
    const widthHalf = winner ? half : state.half * (1 - kill);
    return {
      left: center - widthHalf,
      right: center + widthHalf,
      live: widthHalf > 0.4,
    };
  }).filter((span) => span.right - span.left > 0.05);
}

function onAsphalt(spans, lat) {
  return spans.some((span) => lat >= span.left && lat <= span.right);
}

function project(d, lat) {
  const x = ((lat - LAT_MIN) / (LAT_MAX - LAT_MIN)) * 200;
  const y = ((d - D_MIN) / (D_MAX - D_MIN)) * 640;
  return { x, y };
}

function ribbon(samples) {
  const tracks = [[], []];
  for (const row of samples) {
    const ordered = [...row].sort((a, b) => (a.left + a.right) - (b.left + b.right));
    tracks[0].push(ordered[0] || null);
    tracks[1].push(ordered[1] || null);
  }
  return tracks;
}

function polygon(points) {
  const poly = document.createElementNS(ns, 'polygon');
  poly.setAttribute('points', points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' '));
  return poly;
}

function paint(svg, sampler, state, windowBand) {
  svg.replaceChildren();
  const step = 4;
  const rows = [];
  const samples = [];
  for (let d = D_MIN; d <= D_MAX; d += step) {
    rows.push(d);
    samples.push(sampler(d, state));
  }
  const tracks = ribbon(samples);
  const colors = ['#3d4a5c', '#6d8494'];
  tracks.forEach((track, index) => {
    const left = [];
    const right = [];
    track.forEach((span, i) => {
      if (!span || span.right - span.left < 0.4) {
        if (left.length > 1) {
          const poly = polygon([...left, ...right.reverse()]);
          poly.setAttribute('fill', colors[index]);
          svg.appendChild(poly);
        }
        left.length = 0;
        right.length = 0;
        return;
      }
      left.push(project(rows[i], span.left));
      right.push(project(rows[i], span.right));
    });
    if (left.length > 1) {
      const poly = polygon([...left, ...right.reverse()]);
      poly.setAttribute('fill', colors[index]);
      svg.appendChild(poly);
    }
  });
  if (windowBand) {
    const top = project(state.diverge, 0);
    const bot = project(state.diverge + state.hold, 0);
    const band = document.createElementNS(ns, 'rect');
    band.setAttribute('x', '0');
    band.setAttribute('y', String(top.y));
    band.setAttribute('width', '200');
    band.setAttribute('height', String(Math.max(1, bot.y - top.y)));
    band.setAttribute('fill', '#2f6f4e');
    band.setAttribute('fill-opacity', '0.28');
    svg.appendChild(band);
  }
  const seam = project(FORK_LEAD, 0);
  const line = document.createElementNS(ns, 'line');
  line.setAttribute('x1', '0');
  line.setAttribute('x2', '200');
  line.setAttribute('y1', String(seam.y));
  line.setAttribute('y2', String(seam.y));
  line.setAttribute('stroke', '#d2a15a');
  line.setAttribute('stroke-dasharray', '3 3');
  svg.appendChild(line);
  const here = project(state.d, state.lat);
  const dot = document.createElementNS(ns, 'circle');
  dot.setAttribute('cx', String(here.x));
  dot.setAttribute('cy', String(here.y));
  dot.setAttribute('r', '4');
  dot.setAttribute('fill', '#f2f5f8');
  svg.appendChild(dot);
}

function decisionText(state) {
  const inside = state.d >= state.diverge && state.d <= state.diverge + state.hold;
  if (state.choice === 0) return 'Решение ещё не принято.';
  if (!inside) return 'Сторона выбрана, но эта метка вне окна: асфальт от неё не прыгает.';
  return state.choice < 0 ? 'Окно выбора, берётся левая дорога.' : 'Окно выбора, берётся правая дорога.';
}

function paintReadout(state) {
  const now = gameSpan(state.d, state);
  const next = proposedSpan(state.d, state);
  const nowWidths = now.map((span) => (span.right - span.left).toFixed(1)).join(' и ') || 'нет';
  const nextWidths = next.map((span) => (span.right - span.left).toFixed(1)).join(' и ') || 'нет';
  el('readout').replaceChildren(
    line(`Игра: ширина ${nowWidths} м. Байк ${onAsphalt(now, state.lat) ? 'на асфальте' : 'мимо асфальта'}.`),
    line(`Две дороги: ширина ${nextWidths} м. Байк ${onAsphalt(next, state.lat) ? 'на асфальте' : 'мимо асфальта'}.`),
    line(decisionText(state)),
    line(`Жёлтая черта — конец зоны, ${FORK_LEAD} м от носа.`),
  );
}

function line(text) {
  const node = document.createElement('div');
  node.textContent = text;
  return node;
}

function draw() {
  const state = read();
  showOutputs(state);
  paint(el('now'), gameSpan, state, false);
  paint(el('next'), proposedSpan, state, true);
  paintReadout(state);
}

document.querySelectorAll('.choice button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.choice button').forEach((other) => {
      other.setAttribute('aria-pressed', other === button ? 'true' : 'false');
    });
    draw();
  });
});

el('controls').addEventListener('input', draw);
draw();

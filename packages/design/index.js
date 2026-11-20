function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function dataAttrs(data) {
  if (!data) return '';
  return Object.entries(data).map(([key, value]) => ` data-${key}="${esc(value)}"`).join('');
}

/** @param {{ id?: string, variant?: 'primary'|'ghost'|'choice'|'compact', icon?: string, label: string, trail?: string, trailOn?: boolean, pressed?: boolean, disabled?: boolean, title?: string, data?: Record<string, string|number|boolean> }} options */
export function button(options) {
  const variant = options.variant || 'ghost';
  const id = options.id ? ` id="${esc(options.id)}"` : '';
  const title = options.title ? ` title="${esc(options.title)}"` : '';
  const disabled = options.disabled ? ' disabled' : '';
  const pressed = options.pressed === undefined ? '' : ` aria-pressed="${options.pressed ? 'true' : 'false'}"`;
  const icon = options.icon ? `<span class="ds-button-icon">${options.icon}</span>` : '';
  const trail = options.trail
    ? `<span class="ds-chip${options.trailOn ? ' ds-chip-on' : ''}">${esc(options.trail)}</span>`
    : '';
  return `<button type="button" class="ds-button ds-button-${variant}"${id}${title}${disabled}${pressed}${dataAttrs(options.data)}>${icon}<span class="ds-button-label">${esc(options.label)}</span>${trail}</button>`;
}

/** @param {{ id?: string, icon: string, title: string }} options */
export function iconButton(options) {
  return `<button type="button" class="ds-icon-button" id="${esc(options.id)}" title="${esc(options.title)}">${options.icon}</button>`;
}

/** @param {string} label @param {string} body */
export function field(label, body) {
  return `<div class="ds-field"><span>${esc(label)}</span><div class="ds-seg">${body}</div></div>`;
}

/** @param {[string, string][]} items @param {string} active */
export function tabs(items, active) {
  const buttons = items.map(([id, label]) => {
    const on = id === active ? ' ds-tab-on' : '';
    return `<button type="button" class="ds-tab${on}" data-tab="${esc(id)}">${esc(label)}</button>`;
  }).join('');
  return `<div class="ds-tabs">${buttons}</div>`;
}

/** @param {string} inner */
export function tabBody(inner) {
  return `<div class="ds-tab-body">${inner}</div>`;
}

/**
 * @param {{ id?: string, valueId?: string, label: string, min: number, max: number, step?: number, value: string|number, suffix?: string, hint?: string }} options
 */
export function slider(options) {
  const id = options.id ? ` id="${esc(options.id)}"` : '';
  const valueId = options.valueId ? ` id="${esc(options.valueId)}"` : '';
  const suffix = options.suffix ? esc(options.suffix) : '';
  const step = options.step == null ? '' : ` step="${esc(options.step)}"`;
  const hint = options.hint ? `<div class="ds-slider-hint">${esc(options.hint)}</div>` : '';
  return `<div class="ds-slider">
    <div class="ds-slider-head">
      <span>${esc(options.label)}</span>
      <b><span${valueId}>${esc(options.value)}</span>${suffix}</b>
    </div>
    <input type="range"${id} min="${esc(options.min)}" max="${esc(options.max)}"${step} value="${esc(options.value)}">
    ${hint}
  </div>`;
}

/** @param {{ id: string, label: string, checked?: boolean }} options */
export function check(options) {
  const checked = options.checked ? ' checked' : '';
  return `<label class="ds-check"><input type="checkbox" id="${esc(options.id)}"${checked}><span>${esc(options.label)}</span></label>`;
}

/**
 * @param {string} title
 * @param {{ on?: boolean, disabled?: boolean, preview?: string, label: string, detail: string, data?: Record<string, string|number|boolean> }[]} cards
 */
export function choiceGrid(title, cards) {
  const items = cards.map((card) => {
    const on = card.on ? ' ds-choice-on' : '';
    const disabled = card.disabled ? ' disabled' : '';
    return `<button type="button" class="ds-choice${on}"${disabled}${dataAttrs(card.data)}>
      <div class="ds-choice-preview">${card.preview || ''}</div>
      <div class="ds-choice-label">${esc(card.label)}</div>
      <div class="ds-choice-desc">${esc(card.detail)}</div>
    </button>`;
  }).join('');
  const head = title ? `<div class="ds-choice-title">${esc(title)}</div>` : '';
  return `<div class="ds-choices">${head}<div class="ds-choice-grid">${items}</div></div>`;
}

/** @param {string} title @param {string} [kicker] */
export function heading(title, kicker) {
  return `<h2 class="ds-title">${esc(title)}</h2>${kicker ? `<p class="ds-kicker">${esc(kicker)}</p>` : ''}`;
}

/** @param {string} message */
export function note(message) {
  return `<p class="ds-note">${esc(message)}</p>`;
}

/** @param {string} message @param {'ok'|'err'|''} [tone] */
export function callout(message, tone) {
  const name = tone ? ` ds-callout-${tone}` : '';
  return `<div class="ds-callout${name}">${message}</div>`;
}

/** @param {{ id?: string, label: string, value: string }} options */
export function currency(options) {
  const id = options.id ? ` id="${esc(options.id)}"` : '';
  return `<div class="ds-currency"><span>${esc(options.label)}</span><b${id}>${esc(options.value)}</b></div>`;
}

/** @param {string} label @param {string} value */
export function balance(label, value) {
  return `<div class="ds-balance"><span>${esc(label)}</span><b>${esc(value)}</b></div>`;
}

/** @param {string} label @param {string} control */
export function inline(label, control) {
  return `<div class="ds-inline"><span>${esc(label)}</span>${control}</div>`;
}

/** @param {{ label: string, value: string, tone?: 'text'|'gold'|'signal'|'good'|'bad' }[]} rows */
export function stats(rows) {
  return `<div class="ds-stats">${rows.map((row) => {
    const tone = row.tone || 'text';
    return `<div><span>${esc(row.label)}</span><b class="ds-stat-${tone}">${esc(row.value)}</b></div>`;
  }).join('')}</div>`;
}

/**
 * @param {string} inner
 * @param {{ size?: 'default'|'narrow', tone?: 'default'|'danger', className?: string }} [options]
 */
export function panel(inner, options = {}) {
  const size = options.size === 'narrow' ? ' ds-panel-narrow' : '';
  const tone = options.tone === 'danger' ? ' ds-panel-danger' : '';
  const extra = options.className ? ` ${options.className}` : '';
  return `<div class="ds-panel${size}${tone}${extra}">${inner}</div>`;
}

/** @param {{ left?: string, right?: string, compact?: boolean }} [options] */
export function logo(options = {}) {
  const left = options.left || 'bajaj';
  const right = options.right || 'GO';
  const compact = options.compact ? ' ds-logo-compact' : '';
  return `<div class="ds-logo-wrap${compact}">
    <div class="ds-speed" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="ds-logo"><span class="ds-logo-left">${esc(left)}</span><span class="ds-logo-right">${esc(right)}</span></div>
  </div>`;
}

/** @param {string} label @param {'plain'|'warm'|'warn'|'good'} [tone] */
export function tag(label, tone) {
  const name = tone && tone !== 'plain' ? ` ds-tag-${tone}` : '';
  return `<span class="ds-tag${name}">${esc(label)}</span>`;
}

/** @param {{ color: string, title: string, on?: boolean, data?: Record<string, string|number> }} options */
export function swatch(options) {
  const on = options.on ? ' ds-swatch-on' : '';
  return `<button type="button" class="ds-swatch${on}" style="background:${esc(options.color)}" title="${esc(options.title)}"${dataAttrs(options.data)}></button>`;
}

/** @param {string} label @param {string} items */
export function swatchRow(label, items) {
  return `<div class="ds-swatches"><span>${esc(label)}</span>${items}</div>`;
}

/**
 * @param {{ on?: boolean, mark?: string, title: string, meta?: string, detail?: string, extra?: string, footer?: string, aside?: string }} options
 */
export function card(options) {
  const on = options.on ? ' ds-card-on' : '';
  const mark = options.mark ? `<div class="ds-card-mark">${options.mark}</div>` : '';
  const meta = options.meta ? `<span class="ds-card-meta">${options.meta}</span>` : '';
  const detail = options.detail ? `<small>${esc(options.detail)}</small>` : '';
  const aside = options.aside ? `<div class="ds-card-aside">${options.aside}</div>` : '';
  const footer = options.footer ? `<div class="ds-card-footer">${options.footer}</div>` : '';
  return `<article class="ds-card${on}">${mark}<div class="ds-card-main"><header><b>${esc(options.title)}</b>${meta}</header>${detail}${options.extra || ''}${footer}</div>${aside}</article>`;
}

/** @param {string} inner */
export function rows(inner) {
  return `<div class="ds-rows">${inner}</div>`;
}

/** @param {{ icon: string, title: string, detail: string, price: string, disabled?: boolean, data?: Record<string, string|number> }} options */
export function listItem(options) {
  const disabled = options.disabled ? ' disabled' : '';
  return `<button type="button" class="ds-list"${disabled}${dataAttrs(options.data)}>
    <span class="ds-list-icon">${options.icon}</span>
    <span class="ds-list-body"><b>${esc(options.title)}</b><small>${esc(options.detail)}</small></span>
    <span class="ds-list-price">${esc(options.price)}</span>
  </button>`;
}

/**
 * @param {{ badge: string, actions: string, balance: string, footer: string, tools: string, biome?: string }} parts
 */
export function menuScreen(parts) {
  return `<div class="ds-menu">
    <div class="ds-menu-top">
      <div class="ds-menu-col">
        ${logo()}
        <p class="ds-badge">${parts.badge}</p>
        ${parts.biome ? `<div class="ds-biome">${parts.biome}</div>` : ''}
        <div class="ds-stack">${parts.actions}</div>
      </div>
      ${parts.balance}
    </div>
    <div class="ds-menu-bottom">
      <p class="ds-footer">${esc(parts.footer)}</p>
      <div class="ds-tools">${parts.tools}</div>
    </div>
  </div>`;
}

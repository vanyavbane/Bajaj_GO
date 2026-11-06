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

/** @param {string} title @param {string} [kicker] */
export function heading(title, kicker) {
  return `<h2 class="ds-title">${esc(title)}</h2>${kicker ? `<p class="ds-kicker">${esc(kicker)}</p>` : ''}`;
}

/** @param {string} message */
export function note(message) {
  return `<p class="ds-note">${esc(message)}</p>`;
}

/** @param {string} message */
export function callout(message) {
  return `<div class="ds-callout">${message}</div>`;
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

/** @param {{ label: string, value: string, tone?: 'text'|'gold'|'signal' }[]} rows */
export function stats(rows) {
  return `<div class="ds-stats">${rows.map((row) => {
    const tone = row.tone || 'text';
    return `<div><span>${esc(row.label)}</span><b class="ds-stat-${tone}">${esc(row.value)}</b></div>`;
  }).join('')}</div>`;
}

/**
 * @param {string} inner
 * @param {{ size?: 'default'|'narrow', tone?: 'default'|'danger' }} [options]
 */
export function panel(inner, options = {}) {
  const size = options.size === 'narrow' ? ' ds-panel-narrow' : '';
  const tone = options.tone === 'danger' ? ' ds-panel-danger' : '';
  return `<div class="ds-panel${size}${tone}">${inner}</div>`;
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
 * @param {{ badge: string, actions: string, balance: string, footer: string, tools: string }} parts
 */
export function menuScreen(parts) {
  return `<div class="ds-menu">
    <div class="ds-menu-top">
      <div class="ds-menu-col">
        ${logo()}
        <p class="ds-badge">${parts.badge}</p>
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

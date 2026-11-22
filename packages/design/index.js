import { icon, iconPaths } from './icons.js';

export { icon, iconPaths };
import '@shoelace-style/shoelace/dist/components/alert/alert.js';
import '@shoelace-style/shoelace/dist/components/badge/badge.js';
import '@shoelace-style/shoelace/dist/components/button/button.js';
import '@shoelace-style/shoelace/dist/components/card/card.js';
import '@shoelace-style/shoelace/dist/components/checkbox/checkbox.js';
import '@shoelace-style/shoelace/dist/components/range/range.js';
import '@shoelace-style/shoelace/dist/components/tab-group/tab-group.js';
import '@shoelace-style/shoelace/dist/components/tab-panel/tab-panel.js';
import '@shoelace-style/shoelace/dist/components/tab/tab.js';

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
  const solid = options.pressed || variant === 'primary';
  const slVariant = solid ? 'primary' : variant === 'danger' ? 'danger' : 'neutral';
  const outline = solid ? '' : ' outline';
  const size = variant === 'compact' || variant === 'choice' ? 'small' : 'medium';
  const id = options.id ? ` id="${esc(options.id)}"` : '';
  const title = options.title ? ` title="${esc(options.title)}"` : '';
  const disabled = options.disabled ? ' disabled' : '';
  const pressed = options.pressed === undefined ? '' : ` aria-pressed="${options.pressed ? 'true' : 'false'}"`;
  const glyph = options.icon ? `<span slot="prefix" class="ds-button-icon">${icon(options.icon)}</span>` : '';
  const trail = options.trail
    ? `<sl-badge slot="suffix" variant="${options.trailOn ? 'primary' : 'neutral'}">${esc(options.trail)}</sl-badge>`
    : '';
  return `<sl-button variant="${slVariant}"${outline} size="${size}" class="ds-button ds-button-${variant}"${id}${title}${disabled}${pressed}${dataAttrs(options.data)}>${glyph}${esc(options.label)}${trail}</sl-button>`;
}

/** @param {{ id?: string, icon: string, title: string }} options */
export function iconButton(options) {
  return `<sl-button variant="neutral" size="medium" class="ds-icon-button" id="${esc(options.id)}" title="${esc(options.title)}" aria-label="${esc(options.title)}">${icon(options.icon)}</sl-button>`;
}

/** @param {string} label @param {string} body */
export function field(label, body) {
  return `<div class="ds-field" role="group" aria-label="${esc(label)}"><span>${esc(label)}</span><div class="ds-seg">${body}</div></div>`;
}

/**
 * @param {[string, string][]} items
 * @param {string} active
 * @param {string | Record<string, string>} [body] текст активной вкладки или тела всех вкладок
 */
export function tabs(items, active, body = '') {
  const bodyFor = typeof body === 'string'
    ? (id) => (id === active ? body : '')
    : (id) => (body && body[id]) || '';
  const nav = items.map(([id, label]) => {
    const on = id === active;
    return `<sl-tab slot="nav" class="ds-tab" panel="${esc(id)}" data-tab="${esc(id)}"${on ? ' active' : ''}>${esc(label)}</sl-tab>`;
  }).join('');
  const panels = items.map(([id]) => {
    const content = bodyFor(id);
    const inner = content ? `<div class="ds-tab-body">${content}</div>` : '';
    const on = id === active ? ' active' : '';
    return `<sl-tab-panel name="${esc(id)}"${on}>${inner}</sl-tab-panel>`;
  }).join('');
  return `<sl-tab-group class="ds-tabs">${nav}${panels}</sl-tab-group>`;
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
  const hint = options.hint ? `<p class="ds-slider-hint">${esc(options.hint)}</p>` : '';
  return `<div class="ds-slider">
    <div class="ds-slider-head">
      <span>${esc(options.label)}</span>
      <b><span${valueId}>${esc(options.value)}</span>${suffix}</b>
    </div>
    <sl-range class="ds-range" tooltip="none"${id} min="${esc(options.min)}" max="${esc(options.max)}"${step} value="${esc(options.value)}"></sl-range>
    ${hint}
  </div>`;
}

/** @param {{ id: string, label: string, checked?: boolean }} options */
export function check(options) {
  const checked = options.checked ? ' checked' : '';
  return `<sl-checkbox class="ds-check" id="${esc(options.id)}"${checked}>${esc(options.label)}</sl-checkbox>`;
}

/**
 * @param {string} title
 * @param {{ on?: boolean, disabled?: boolean, preview?: string, label: string, detail: string, data?: Record<string, string|number|boolean> }[]} cards
 */
export function choiceGrid(title, cards) {
  const items = cards.map((card) => {
    const on = card.on ? ' ds-choice-on' : '';
    const disabled = card.disabled ? ' disabled' : '';
    const pressed = card.on ? 'true' : 'false';
    const face = card.on ? 'variant="primary"' : 'variant="neutral" outline';
    return `<sl-button ${face} size="medium" class="ds-choice${on}" aria-pressed="${pressed}"${disabled}${dataAttrs(card.data)}>
      <span class="ds-choice-preview">${card.preview || ''}</span>
      <span class="ds-choice-copy">
        <span class="ds-choice-label">${esc(card.label)}</span>
        <span class="ds-choice-desc">${esc(card.detail)}</span>
      </span>
    </sl-button>`;
  }).join('');
  const legend = title ? `<legend class="ds-choice-title">${esc(title)}</legend>` : '';
  return `<fieldset class="ds-choices">${legend}<div class="ds-choice-grid" role="radiogroup"${title ? ` aria-label="${esc(title)}"` : ''}>${items}</div></fieldset>`;
}

/** @param {string} title @param {string} [kicker] @param {string} [iconName] */
export function heading(title, kicker, iconName) {
  const mark = iconName ? icon(iconName) : '';
  return `<h2 class="ds-title">${mark}${esc(title)}</h2>${kicker ? `<p class="ds-kicker">${esc(kicker)}</p>` : ''}`;
}

/** @param {string} message */
export function note(message) {
  return `<p class="ds-note">${esc(message)}</p>`;
}

/** @param {string} message @param {'ok'|'err'|''} [tone] */
export function callout(message, tone) {
  const name = tone ? ` ds-callout-${tone}` : '';
  const variant = tone === 'ok' ? 'success' : tone === 'err' ? 'danger' : 'primary';
  return `<sl-alert class="ds-callout${name}" variant="${variant}" open>${message}</sl-alert>`;
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
  return `<dl class="ds-stats">${rows.map((row) => {
    const tone = row.tone || 'text';
    return `<div><dt>${esc(row.label)}</dt><dd class="ds-stat-${tone}">${esc(row.value)}</dd></div>`;
  }).join('')}</dl>`;
}

/**
 * @param {string} inner
 * @param {{ size?: 'default'|'narrow', tone?: 'default'|'danger', className?: string }} [options]
 */
export function panel(inner, options = {}) {
  const size = options.size === 'narrow' ? ' ds-panel-narrow' : '';
  const tone = options.tone === 'danger' ? ' ds-panel-danger' : '';
  const extra = options.className ? ` ${options.className}` : '';
  return `<sl-card class="ds-panel${size}${tone}${extra}">${inner}</sl-card>`;
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
  const variant = tone === 'good' ? 'success' : tone === 'warn' ? 'danger' : tone === 'warm' ? 'warning' : 'neutral';
  return `<sl-badge class="ds-tag${name}" variant="${variant}">${esc(label)}</sl-badge>`;
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
  const mark = options.mark ? `<div class="ds-card-mark">${icon(options.mark)}</div>` : '';
  const meta = options.meta ? `<span class="ds-card-meta">${options.meta}</span>` : '';
  const detail = options.detail ? `<small>${esc(options.detail)}</small>` : '';
  const aside = options.aside ? `<div class="ds-card-aside">${options.aside}</div>` : '';
  const footer = options.footer ? `<div class="ds-card-footer">${options.footer}</div>` : '';
  return `<li><sl-card class="ds-card${on}">${mark}<div class="ds-card-main"><header><b>${esc(options.title)}</b>${meta}</header>${detail}${options.extra || ''}${footer}</div>${aside}</sl-card></li>`;
}

/** @param {string} inner */
export function rows(inner) {
  return `<ul class="ds-rows">${inner}</ul>`;
}

/** @param {{ icon: string, title: string, detail: string, price: string, disabled?: boolean, data?: Record<string, string|number> }} options */
export function listItem(options) {
  const disabled = options.disabled ? ' disabled' : '';
  return `<li><sl-button variant="neutral" outline class="ds-list"${disabled}${dataAttrs(options.data)}>
    <span slot="prefix" class="ds-list-icon">${icon(options.icon)}</span>
    <span class="ds-list-body"><b>${esc(options.title)}</b><small>${esc(options.detail)}</small></span>
    <span slot="suffix" class="ds-list-price">${esc(options.price)}</span>
  </sl-button></li>`;
}

/**
 * @param {{ badge: string, actions: string, balance: string, footer: string, tools: string, biome?: string }} parts
 */
export function menuScreen(parts) {
  return `<div class="ds-menu">
    <header class="ds-menu-top">
      <div class="ds-menu-col">
        ${logo()}
        <p class="ds-badge">${parts.badge}</p>
        ${parts.biome ? `<div class="ds-biome">${parts.biome}</div>` : ''}
        <nav class="ds-stack" aria-label="Главное меню">${parts.actions}</nav>
      </div>
      ${parts.balance}
    </header>
    <footer class="ds-menu-bottom">
      <p class="ds-footer">${esc(parts.footer)}</p>
      <div class="ds-tools">${parts.tools}</div>
    </footer>
  </div>`;
}

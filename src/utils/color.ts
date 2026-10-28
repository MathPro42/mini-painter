const HEX_COLOR = /^#?(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Normalizes a 3- or 6-digit hex color (leading `#` optional, any case) to
 * lowercase `#rrggbb`. Returns `null` when the input is not a hex color.
 */
export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!HEX_COLOR.test(trimmed)) {
    return null;
  }
  const digits = trimmed.replace('#', '').toLowerCase();
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  return `#${expanded}`;
}

/**
 * Like normalizeHexColor, but throws a RangeError instead of returning `null`.
 * Use it where an invalid color is a programming or input error.
 */
export function parseHexColor(value: string): string {
  const normalized = normalizeHexColor(value);
  if (normalized === null) {
    throw new RangeError(`Not a hex color: "${value}"`);
  }
  return normalized;
}

/**
 * Converts a hex color to a 24-bit integer (`0xrrggbb`), the form Three.js
 * colors accept. Throws a RangeError when the input is not a hex color.
 */
export function hexColorToInt(value: string): number {
  return Number.parseInt(parseHexColor(value).slice(1), 16);
}

const NAMED_COLORS: ReadonlyMap<string, string> = new Map([
  ['black', '#000000'],
  ['white', '#ffffff'],
  ['gray', '#808080'],
  ['grey', '#808080'],
  ['silver', '#c0c0c0'],
  ['red', '#ff0000'],
  ['maroon', '#800000'],
  ['orange', '#ffa500'],
  ['yellow', '#ffff00'],
  ['olive', '#808000'],
  ['lime', '#00ff00'],
  ['green', '#008000'],
  ['aqua', '#00ffff'],
  ['cyan', '#00ffff'],
  ['teal', '#008080'],
  ['blue', '#0000ff'],
  ['navy', '#000080'],
  ['fuchsia', '#ff00ff'],
  ['magenta', '#ff00ff'],
  ['purple', '#800080'],
]);

const CSS_HEX = /^#([0-9a-f]+)$/;
const CSS_RGB =
  /^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/;

/**
 * Normalizes the CSS color forms SVG files use for fills to lowercase
 * `#rrggbb`: hex with or without alpha, `rgb()`/`rgba()`, and basic named
 * colors. Alpha is dropped. Returns `null` for anything else, including
 * `none`, `currentColor` and gradient references.
 */
export function normalizeCssColor(value: string): string | null {
  const color = value.trim().toLowerCase();
  const named = NAMED_COLORS.get(color);
  if (named !== undefined) {
    return named;
  }
  const hex = CSS_HEX.exec(color)?.[1];
  if (hex !== undefined) {
    return hexWithoutAlpha(hex);
  }
  const rgb = CSS_RGB.exec(color);
  return rgb === null ? null : rgbToHex(rgb.slice(1, 4));
}

/**
 * The alpha a CSS color states (`rgba(…, .6)`, `rgb(… / 60%)`, `#rrggbbaa`,
 * `#rgba`), from 0 to 1. Returns `null` when it states none, or when
 * normalizeCssColor would not read it.
 */
export function cssColorAlpha(value: string): number | null {
  const color = value.trim().toLowerCase();
  if (normalizeCssColor(color) === null) {
    return null;
  }
  const hex = CSS_HEX.exec(color)?.[1];
  if (hex !== undefined) {
    const digits = hex.length === 4 ? hex.slice(3).repeat(2) : hex.slice(6);
    return digits.length === 2 ? Number.parseInt(digits, 16) / 255 : null;
  }
  const alpha = CSS_RGB.exec(color)?.[4];
  if (alpha === undefined) {
    return null;
  }
  const amount = Number.parseFloat(alpha) / (alpha.endsWith('%') ? 100 : 1);
  return Number.isNaN(amount) ? null : Math.min(1, Math.max(0, amount));
}

/**
 * A see-through paint's opacity: `value` rounded to 3 decimals when it is
 * strictly between 0 and 1. Returns `null` for opaque (1 or more), invisible
 * (0 or less) and non-numbers, so only real see-through paints carry one.
 */
export function normalizeOpacity(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value * 1000) / 1000;
  return rounded > 0 && rounded < 1 ? rounded : null;
}

/** `#rrggbb` plus an opacity as `#rrggbbaa`, the form canvas fill styles accept. */
export function hexWithAlpha(hex: string, opacity: number): string {
  const alpha = Math.round(Math.min(1, Math.max(0, opacity)) * 255);
  return parseHexColor(hex) + alpha.toString(16).padStart(2, '0');
}

/** `#rrggbb` plus an opacity as `rgba(r, g, b, a)`, the form palette spreadsheets use. */
export function rgbaText(hex: string, opacity: number): string {
  const value = hexColorToInt(hex);
  const channels = [value >> 16, (value >> 8) & 0xff, value & 0xff].map(String);
  return `rgba(${channels.join(', ')}, ${String(opacity)})`;
}

function hexWithoutAlpha(digits: string): string | null {
  if (digits.length === 3 || digits.length === 4) {
    return normalizeHexColor(digits.slice(0, 3));
  }
  if (digits.length === 6 || digits.length === 8) {
    return normalizeHexColor(digits.slice(0, 6));
  }
  return null;
}

function rgbToHex(channels: readonly string[]): string | null {
  const bytes = channels.map((channel) => {
    const amount = Number.parseFloat(channel);
    const scaled = channel.endsWith('%') ? (amount * 255) / 100 : amount;
    return Math.round(Math.min(255, Math.max(0, scaled)));
  });
  if (bytes.some(Number.isNaN)) {
    return null;
  }
  return `#${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

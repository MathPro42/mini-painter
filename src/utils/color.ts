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

/** An SVG number: optional sign, digits with an optional fraction, optional exponent. */
export const NUMBER_PATTERN = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?`;

const NUMBERS = new RegExp(NUMBER_PATTERN, 'g');
const PLAIN_LENGTH = new RegExp(String.raw`^\s*(${NUMBER_PATTERN})\s*(?:px)?\s*$`);

/**
 * Reads every number in an SVG number list (`viewBox`, `points`, transform
 * arguments). Separators are whitespace and commas, but numbers may also run
 * together (`10-5` is two numbers), as the SVG grammar allows.
 */
export function readNumbers(text: string): number[] {
  return Array.from(text.matchAll(NUMBERS), (match) => Number(match[0]));
}

/** Reads a unitless or `px` length. Returns `null` for other units, percentages or junk. */
export function readPlainLength(text: string | undefined): number | null {
  const match = text === undefined ? null : PLAIN_LENGTH.exec(text);
  return match ? Number(match[1]) : null;
}

// Strings in BIFF8 (.xls) files. A record holds at most 8224 bytes, so long
// data spills into CONTINUE records. Inside character data, each continuation
// starts with a fresh option byte saying whether the rest is 1 or 2 bytes per char.

const TRUNCATED = 'The file is truncated or corrupt (string table)';
const HIGH_BYTE = 0x01;
const EXTENDED = 0x04;
const RICH = 0x08;

/** Sequential reader over a record's data followed by its CONTINUE records. */
export interface BiffReader {
  u8: () => number;
  u16: () => number;
  u32: () => number;
  skip: (count: number) => void;
  /** Reads `count` characters, honouring the option byte at each record boundary. */
  chars: (count: number, wide: boolean) => string;
}

export function createBiffReader(segments: readonly Uint8Array[]): BiffReader {
  let index = 0;
  let position = 0;
  const current = (): Uint8Array => segments[index] ?? new Uint8Array();
  const nextSegment = (): void => {
    if (index >= segments.length - 1) {
      throw new RangeError(TRUNCATED);
    }
    index += 1;
    position = 0;
  };
  const u8 = (): number => {
    while (position >= current().byteLength) {
      nextSegment();
    }
    const byte = current()[position] ?? 0;
    position += 1;
    return byte;
  };
  const u16 = (): number => u8() | (u8() << 8);
  return {
    u8,
    u16,
    u32: () => (u16() | (u16() << 16)) >>> 0,
    skip: (count) => {
      for (let left = count; left > 0;) {
        if (position >= current().byteLength) {
          nextSegment();
        }
        const step = Math.min(left, current().byteLength - position);
        position += step;
        left -= step;
      }
    },
    chars: (count, wide) => {
      let text = '';
      let isWide = wide;
      for (let left = count; left > 0;) {
        if (position >= current().byteLength) {
          nextSegment();
          isWide = (u8() & HIGH_BYTE) !== 0;
        }
        const width = isWide ? 2 : 1;
        const take = Math.min(left, Math.floor((current().byteLength - position) / width));
        if (take === 0) {
          throw new RangeError(TRUNCATED);
        }
        text += decodeCodeUnits(current().subarray(position, position + take * width), isWide);
        position += take * width;
        left -= take;
      }
      return text;
    },
  };
}

/** Reads an XLUnicodeRichExtendedString: a string with optional formatting runs and phonetic data. */
export function readRichString(reader: BiffReader): string {
  const length = reader.u16();
  const options = reader.u8();
  const runs = (options & RICH) === 0 ? 0 : reader.u16();
  const extended = (options & EXTENDED) === 0 ? 0 : reader.u32();
  const text = reader.chars(length, (options & HIGH_BYTE) !== 0);
  reader.skip(runs * 4 + extended);
  return text;
}

/** Reads the shared string table (SST record plus its CONTINUE records). */
export function readSharedStringTable(segments: readonly Uint8Array[]): string[] {
  const reader = createBiffReader(segments);
  reader.u32(); // Total references to the table; only the unique count matters.
  const unique = reader.u32();
  const strings: string[] = [];
  for (let index = 0; index < unique; index += 1) {
    strings.push(readRichString(reader));
  }
  return strings;
}

/** Decodes UTF-16LE code units, or "compressed" ones that store only the low byte. */
function decodeCodeUnits(bytes: Uint8Array, wide: boolean): string {
  if (wide) {
    return new TextDecoder('utf-16le').decode(bytes);
  }
  let text = '';
  for (const byte of bytes) {
    text += String.fromCharCode(byte);
  }
  return text;
}

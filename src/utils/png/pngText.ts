import { concatBytes } from '../spreadsheet/bytes';

/** An international text (`iTXt`) chunk. */
export interface PngText {
  /** 1 to 79 Latin-1 characters. */
  readonly keyword: string;
  /** Whether `text` is zlib-compressed. */
  readonly compressed: boolean;
  /** UTF-8 text, or its zlib stream when compressed. */
  readonly text: Uint8Array;
}

const latin1 = new TextDecoder('latin1');

/** Builds an `iTXt` chunk's data, with no language tag or translated keyword. */
export function encodeITxt({ keyword, compressed, text }: PngText): Uint8Array {
  if (!/^[\x20-\x7e]{1,79}$/.test(keyword)) {
    throw new RangeError(`Not a PNG text keyword: "${keyword}"`);
  }
  const header = new TextEncoder().encode(keyword);
  // keyword NUL, compression flag, method 0 (zlib), empty language NUL, empty translation NUL
  return concatBytes([header, Uint8Array.of(0, compressed ? 1 : 0, 0, 0, 0), text]);
}

/** Reads an `iTXt` chunk's data. Throws a RangeError when it is malformed. */
export function decodeITxt(data: Uint8Array): PngText {
  const keywordEnd = data.indexOf(0);
  const flag = data[keywordEnd + 1];
  const method = data[keywordEnd + 2];
  const languageEnd = data.indexOf(0, keywordEnd + 3);
  const translationEnd = languageEnd < 0 ? -1 : data.indexOf(0, languageEnd + 1);
  if (keywordEnd < 1 || translationEnd < 0 || (flag !== 0 && flag !== 1) || method !== 0) {
    throw new RangeError('The file is truncated or corrupt (png text)');
  }
  return {
    keyword: latin1.decode(data.subarray(0, keywordEnd)),
    compressed: flag === 1,
    text: data.subarray(translationEnd + 1),
  };
}

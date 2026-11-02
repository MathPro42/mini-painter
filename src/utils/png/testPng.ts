import { concatBytes } from '../spreadsheet/bytes';
import { encodePngChunk } from './pngChunks';

const SIGNATURE = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);

/**
 * A 1×1 PNG for tests. Its IDAT is a stored (uncompressed) zlib stream
 * holding one brick-red pixel, so no compressor is needed to build it.
 */
export function onePixelPng(): Uint8Array {
  // width 1, height 1, bit depth 8, color type 2 (RGB), no interlace
  const header = Uint8Array.of(0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0);
  const pixels = Uint8Array.of(0x78, 0x01, 1, 4, 0, 0xfb, 0xff, 0, 0xc8, 0x55, 0x3d, 0, 0, 0, 0);
  return concatBytes([
    SIGNATURE,
    encodePngChunk('IHDR', header),
    encodePngChunk('IDAT', pixels),
    encodePngChunk('IEND', new Uint8Array()),
  ]);
}

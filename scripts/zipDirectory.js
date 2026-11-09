// Packs a directory into a zip file with Node alone, so `npm run build` needs no
// `zip` tool. Usage: node scripts/zipDirectory.js <dir> <out.zip> <folder in zip>
import { crc32, deflateRawSync } from 'node:zlib';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every entry gets one fixed date (1 Jan 2000, in DOS format), so a rebuild of
// the same files gives the same zip.
const DOS_TIME = 0;
const DOS_DATE = (20 << 9) | (1 << 5) | 1;

/** Zip entries for every file under `dir`, named `<folder>/<path>`. */
export function readEntries(dir, folder) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .sort()
    .map((path) => ({
      name: `${folder}/${relative(dir, path).split(sep).join('/')}`,
      data: readFileSync(path),
    }));
}

/** A zip archive (deflate, no zip64) holding `entries` of `{ name, data }`. */
export function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, 'utf8');
    const packed = deflateRawSync(data);
    const fields = { crc: crc32(data), packed: packed.length, size: data.length, nameBytes };
    const local = Buffer.concat([header(0x04034b50, fields, null), nameBytes, packed]);
    centrals.push(Buffer.concat([header(0x02014b50, fields, offset), nameBytes]));
    locals.push(local);
    offset += local.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

/** A local header, or a central one when `offset` (of the local header) is given. */
function header(signature, { crc, packed, size, nameBytes }, offset) {
  const central = offset !== null;
  const buffer = Buffer.alloc(central ? 46 : 30);
  let at = 0;
  const u16 = (value) => {
    at = buffer.writeUInt16LE(value, at);
  };
  const u32 = (value) => {
    at = buffer.writeUInt32LE(value, at);
  };
  u32(signature);
  if (central) {
    u16(20); // made by: version 2.0
  }
  u16(20); // needed to extract: version 2.0
  u16(0x0800); // names are UTF-8
  u16(8); // deflate
  u16(DOS_TIME);
  u16(DOS_DATE);
  u32(crc);
  u32(packed);
  u32(size);
  u16(nameBytes.length);
  u16(0); // extra field length
  if (central) {
    u16(0); // comment length
    u16(0); // disk number
    u16(0); // internal attributes
    u32(0); // external attributes
    u32(offset);
  }
  return buffer;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, out, folder] = process.argv.slice(2);
  if (dir === undefined || out === undefined || folder === undefined) {
    console.error('Usage: node scripts/zipDirectory.js <dir> <out.zip> <folder in zip>');
    process.exit(1);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, createZip(readEntries(dir, folder)));
}

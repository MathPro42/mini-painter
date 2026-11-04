import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createDrawingId, createIndexedDbWorkStorage } from './workStorage';

const WORK = { drawingId: 'a', drawing: '<svg/>', history: 'one' };
const OTHER_WORK = { drawingId: 'b', drawing: '<svg id="other"/>', history: 'two' };

/** Writes keys straight into the work database, as an older version of the app would have. */
async function putRaw(
  factory: IDBFactory,
  values: Readonly<Record<string, string>>,
): Promise<void> {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open('mini-painter', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('work');
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(new Error('open failed', { cause: request.error }));
    };
  });
  const transaction = database.transaction('work', 'readwrite');
  for (const [key, value] of Object.entries(values)) {
    transaction.objectStore('work').put(value, key);
  }
  await new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => {
      resolve();
    };
    transaction.onabort = () => {
      reject(new Error('write failed', { cause: transaction.error }));
    };
  });
  database.close();
}

describe('createIndexedDbWorkStorage', () => {
  it('has nothing saved at first', async () => {
    expect(await createIndexedDbWorkStorage(new IDBFactory()).load()).toBeNull();
  });

  it('saves the drawing, its id and its history', async () => {
    const storage = createIndexedDbWorkStorage(new IDBFactory());
    await storage.save(WORK);
    expect(await storage.load()).toEqual(WORK);
  });

  it('writes only the history while it holds the drawing with that id', async () => {
    const storage = createIndexedDbWorkStorage(new IDBFactory());
    await storage.save(WORK);
    await storage.save({ ...WORK, drawing: '<svg id="not-written"/>', history: 'two' });
    expect(await storage.load()).toEqual({ ...WORK, history: 'two' });
  });

  it('writes the drawing again when another one was saved since', async () => {
    const storage = createIndexedDbWorkStorage(new IDBFactory());
    await storage.save(WORK);
    await storage.save(OTHER_WORK);
    expect(await storage.load()).toEqual(OTHER_WORK);
    await storage.save({ ...WORK, history: 'three' });
    expect(await storage.load()).toEqual({ ...WORK, history: 'three' });
  });

  it('keeps the work between openings of the database', async () => {
    const factory = new IDBFactory();
    await createIndexedDbWorkStorage(factory).save(WORK);
    expect(await createIndexedDbWorkStorage(factory).load()).toEqual(WORK);
  });

  it('reads half-saved work as none', async () => {
    const factory = new IDBFactory();
    await putRaw(factory, { history: 'one' });
    expect(await createIndexedDbWorkStorage(factory).load()).toBeNull();
  });

  it('gives work saved without a drawing id a fresh one, which a save then stores', async () => {
    const factory = new IDBFactory();
    await putRaw(factory, { drawing: '<svg/>', history: 'one' });
    const storage = createIndexedDbWorkStorage(factory);
    const loaded = await storage.load();
    const drawingId = loaded?.drawingId ?? '';
    expect(drawingId).toMatch(/^[0-9a-f]{32}$/);
    expect(loaded).toEqual({ drawingId, drawing: '<svg/>', history: 'one' });

    await storage.save({ drawingId, drawing: '<svg id="saved"/>', history: 'two' });
    expect(await storage.load()).toEqual({
      drawingId,
      drawing: '<svg id="saved"/>',
      history: 'two',
    });
  });

  it('clears the work, and saves the whole drawing after', async () => {
    const storage = createIndexedDbWorkStorage(new IDBFactory());
    await storage.save(WORK);
    await storage.clear();
    expect(await storage.load()).toBeNull();
    await storage.save({ ...WORK, history: 'two' });
    expect(await storage.load()).toEqual({ ...WORK, history: 'two' });
  });

  it('reports a database that cannot open', async () => {
    const factory = new IDBFactory();
    const open = factory.open.bind(factory);
    factory.open = (name, version) => open(name, (version ?? 1) - 1);
    await expect(createIndexedDbWorkStorage(factory).load()).rejects.toThrow();
  });

  it('reports a transaction that fails, and keeps what it held', async () => {
    const storage = createIndexedDbWorkStorage(new IDBFactory());
    await storage.save(WORK);
    const unclonable = { ...OTHER_WORK, history: Symbol('no') } as unknown as typeof WORK;
    await expect(storage.save(unclonable)).rejects.toThrow();
    expect(await storage.load()).toEqual(WORK);
  });
});

describe('createDrawingId', () => {
  it('makes a new random id each time', () => {
    const id = createDrawingId();
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(createDrawingId()).not.toBe(id);
  });
});

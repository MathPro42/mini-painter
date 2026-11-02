import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { createIndexedDbWorkStorage } from './workStorage';

describe('createIndexedDbWorkStorage', () => {
  it('has nothing saved at first', async () => {
    expect(await createIndexedDbWorkStorage(new IDBFactory()).load()).toBeNull();
  });

  it('saves the drawing and history together, and the history alone after', async () => {
    const storage = createIndexedDbWorkStorage(new IDBFactory());
    await storage.save({ drawing: '<svg/>', history: 'one' });
    await storage.save({ history: 'two' });
    expect(await storage.load()).toEqual({ drawing: '<svg/>', history: 'two' });
  });

  it('keeps the work between openings of the database', async () => {
    const factory = new IDBFactory();
    await createIndexedDbWorkStorage(factory).save({ drawing: '<svg/>', history: 'one' });
    expect(await createIndexedDbWorkStorage(factory).load()).toEqual({
      drawing: '<svg/>',
      history: 'one',
    });
  });

  it('reads half-saved work as none', async () => {
    const storage = createIndexedDbWorkStorage(new IDBFactory());
    await storage.save({ history: 'one' });
    expect(await storage.load()).toBeNull();
  });

  it('clears the work', async () => {
    const storage = createIndexedDbWorkStorage(new IDBFactory());
    await storage.save({ drawing: '<svg/>', history: 'one' });
    await storage.clear();
    expect(await storage.load()).toBeNull();
  });

  it('reports a database that cannot open', async () => {
    const factory = new IDBFactory();
    const open = factory.open.bind(factory);
    factory.open = (name, version) => open(name, (version ?? 1) - 1);
    await expect(createIndexedDbWorkStorage(factory).load()).rejects.toThrow();
  });

  it('reports a transaction that fails', async () => {
    const storage = createIndexedDbWorkStorage(new IDBFactory());
    await storage.save({ drawing: '<svg/>', history: 'one' });
    const unclonable = { history: Symbol('no') } as unknown as { history: string };
    await expect(storage.save(unclonable)).rejects.toThrow();
  });
});

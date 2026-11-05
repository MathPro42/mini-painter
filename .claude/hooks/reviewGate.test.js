import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { REVIEW_REQUEST, changesFingerprint, reviewRequest } from './reviewGate.js';

const DIFF = 'diff --git a/cube.ts b/cube.ts\n+export const side = 2;\n';

describe('changesFingerprint', () => {
  it('is null when nothing changed', () => {
    expect(changesFingerprint('', new Map())).toBeNull();
  });

  it('is stable for the same changes and differs for others', () => {
    const first = changesFingerprint(DIFF, new Map());
    expect(changesFingerprint(DIFF, new Map())).toBe(first);
    expect(changesFingerprint(`${DIFF}+more\n`, new Map())).not.toBe(first);
  });

  it('counts new files and their contents, in any order', () => {
    const files = new Map([
      ['b.ts', 'sphere'],
      ['a.ts', 'cube'],
    ]);
    const fingerprint = changesFingerprint('', files);
    expect(fingerprint).not.toBeNull();
    expect(changesFingerprint('', new Map([...files].reverse()))).toBe(fingerprint);
    expect(changesFingerprint('', new Map([['a.ts', 'cube']]))).not.toBe(fingerprint);
    expect(
      changesFingerprint(
        '',
        new Map([
          ['a.ts', 'cube'],
          ['b.ts', 'brick red'],
        ]),
      ),
    ).not.toBe(fingerprint);
  });
});

describe('reviewRequest', () => {
  const base = { stopHookActive: false, fingerprint: 'abc', reviewedFingerprint: null };

  it('asks for a review of changes nobody reviewed', () => {
    expect(reviewRequest(base)).toBe(REVIEW_REQUEST);
    expect(reviewRequest({ ...base, reviewedFingerprint: 'old' })).toBe(REVIEW_REQUEST);
  });

  it('lets Claude stop when there is nothing to review', () => {
    expect(reviewRequest({ ...base, fingerprint: null })).toBeNull();
  });

  it('asks once for the same changes', () => {
    expect(reviewRequest({ ...base, reviewedFingerprint: 'abc' })).toBeNull();
  });

  it('never sends Claude back twice in a row', () => {
    expect(reviewRequest({ ...base, stopHookActive: true })).toBeNull();
  });

  it('names the skill and the independent reviewer', () => {
    expect(REVIEW_REQUEST).toContain('/code-review');
    expect(REVIEW_REQUEST).toContain('subagent');
  });
});

describe('requireCodeReview.js', () => {
  const dirs = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /** A repository with a `main` commit, checked out on a feature branch. */
  function repo() {
    const dir = mkdtempSync(join(tmpdir(), 'review-hook-'));
    dirs.push(dir);
    const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'Test');
    writeFileSync(join(dir, 'cube.ts'), 'export const side = 1;\n');
    git('add', '.');
    git('commit', '-q', '-m', 'Cube');
    git('switch', '-q', '-c', 'cube-size');
    return { dir, git };
  }

  function stop(cwd, stopHookActive = false) {
    return spawnSync('node', [join(import.meta.dirname, 'requireCodeReview.js')], {
      input: JSON.stringify({ cwd, stop_hook_active: stopHookActive }),
      encoding: 'utf8',
    });
  }

  it('lets Claude stop on a branch with no changes', () => {
    expect(stop(repo().dir).status).toBe(0);
  });

  it('sends Claude to review changes once, then lets it stop', () => {
    const { dir } = repo();
    writeFileSync(join(dir, 'cube.ts'), 'export const side = 2;\n');
    const first = stop(dir);
    expect(first.status).toBe(2);
    expect(first.stderr).toContain('/code-review');
    expect(stop(dir).status).toBe(0);
  });

  it('asks again when the changes change, committed or new', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'cube.ts'), 'export const side = 2;\n');
    stop(dir);
    git('commit', '-qam', 'Bigger cube');
    expect(stop(dir).status).toBe(0);
    writeFileSync(join(dir, 'sphere.ts'), 'export const radius = 1;\n');
    expect(stop(dir).status).toBe(2);
  });

  it('lets Claude stop when a stop hook already sent it back', () => {
    const { dir } = repo();
    writeFileSync(join(dir, 'cube.ts'), 'export const side = 2;\n');
    expect(stop(dir, true).status).toBe(0);
  });

  it('never blocks outside a repository', () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-repo-'));
    dirs.push(dir);
    expect(stop(dir).status).toBe(0);
  });
});

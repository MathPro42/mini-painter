import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  REVIEW_REQUEST,
  changesFingerprint,
  formatMarker,
  parseMarker,
  reviewDecision,
} from './reviewGate.js';

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

describe('reviewDecision', () => {
  const FP = 'a'.repeat(64);
  const OTHER = 'b'.repeat(64);
  const base = { stopHookActive: false, fingerprint: FP, marker: null };
  const STOP = { request: null, record: null };

  it('asks for a review of changes nobody was asked about, and records that', () => {
    expect(reviewDecision(base)).toEqual({
      request: REVIEW_REQUEST,
      record: { state: 'requested', fingerprint: FP },
    });
    expect(
      reviewDecision({ ...base, marker: { state: 'reviewed', fingerprint: OTHER } }).request,
    ).toBe(REVIEW_REQUEST);
  });

  it('lets Claude stop when there is nothing to review', () => {
    expect(reviewDecision({ ...base, fingerprint: null })).toEqual(STOP);
  });

  it('asks once for the same changes, reviewed or skipped', () => {
    expect(reviewDecision({ ...base, marker: { state: 'reviewed', fingerprint: FP } })).toEqual(
      STOP,
    );
    expect(reviewDecision({ ...base, marker: { state: 'requested', fingerprint: FP } })).toEqual(
      STOP,
    );
  });

  it("counts a requested review's fixes as reviewed at the next stop", () => {
    expect(
      reviewDecision({
        stopHookActive: true,
        fingerprint: OTHER,
        marker: { state: 'requested', fingerprint: FP },
      }),
    ).toEqual({ request: null, record: { state: 'reviewed', fingerprint: OTHER } });
  });

  it('records nothing on a retry another stop hook caused', () => {
    expect(
      reviewDecision({
        stopHookActive: true,
        fingerprint: OTHER,
        marker: { state: 'reviewed', fingerprint: FP },
      }),
    ).toEqual(STOP);
    expect(reviewDecision({ ...base, stopHookActive: true })).toEqual(STOP);
  });

  it('names the skill and the independent reviewer', () => {
    expect(REVIEW_REQUEST).toContain('/code-review');
    expect(REVIEW_REQUEST).toContain('subagent');
  });
});

describe('markers', () => {
  it('read back what they store', () => {
    const marker = { state: 'requested', fingerprint: 'c'.repeat(64) };
    expect(parseMarker(formatMarker(marker))).toEqual(marker);
  });

  it.each([[null], [''], ['done abc'], [`reviewed ${'z'.repeat(64)}`], ['a'.repeat(64)]])(
    'are null for %j',
    (text) => {
      expect(parseMarker(text)).toBeNull();
    },
  );
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

  it("does not start a new review over a review's fixes", () => {
    const { dir } = repo();
    writeFileSync(join(dir, 'cube.ts'), 'export const side = 2;\n');
    expect(stop(dir).status).toBe(2);
    writeFileSync(join(dir, 'cube.ts'), 'export const side = 3;\n');
    expect(stop(dir, true).status).toBe(0);
    expect(stop(dir).status).toBe(0);
    writeFileSync(join(dir, 'sphere.ts'), 'export const radius = 1;\n');
    expect(stop(dir).status).toBe(2);
  });

  it('sees a second edit of a binary file', () => {
    const { dir, git } = repo();
    writeFileSync(join(dir, 'swatch.bin'), Buffer.from([0, 1, 2]));
    git('add', 'swatch.bin');
    expect(stop(dir).status).toBe(2);
    writeFileSync(join(dir, 'swatch.bin'), Buffer.from([0, 1, 3]));
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

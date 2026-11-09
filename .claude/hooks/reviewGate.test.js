import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  REVIEW_REQUEST,
  changesFingerprint,
  countReviews,
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

const reviewCall = (skill) =>
  JSON.stringify({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name: 'Skill', input: { skill, args: 'git' } }] },
  });

describe('countReviews', () => {
  it('counts code-review skill calls, plugin-scoped ones too', () => {
    const transcript = [
      reviewCall('code-review'),
      JSON.stringify({ type: 'user', message: { content: 'please run code-review' } }),
      reviewCall('other-skill'),
      reviewCall('anthropic-skills:code-review'),
    ].join('\n');
    expect(countReviews(transcript)).toBe(2);
  });

  it('counts a /code-review the user typed', () => {
    const typed = (text) => JSON.stringify({ type: 'user', message: { content: text } });
    const transcript = [
      typed(
        '<command-message>code-review</command-message>\n<command-name>/code-review</command-name>',
      ),
      JSON.stringify({
        type: 'user',
        message: {
          content: [{ type: 'text', text: '<command-name>/x:code-review</command-name>' }],
        },
      }),
      typed('what does /code-review do?'),
    ].join('\n');
    expect(countReviews(transcript)).toBe(2);
  });

  it('skips a partly written line and an empty transcript', () => {
    expect(countReviews(`${reviewCall('code-review')}\n{"message":{"content":[{"code-review`)).toBe(
      1,
    );
    expect(countReviews('')).toBe(0);
  });
});

describe('reviewDecision', () => {
  const FP = 'a'.repeat(64);
  const OTHER = 'b'.repeat(64);
  const base = { stopHookActive: false, fingerprint: FP, marker: null, reviewCount: 3 };
  const requested = { state: 'requested', fingerprint: FP, reviews: 3 };
  const STOP = { request: null, record: null };

  it('asks for a review of changes nobody was asked about, noting the reviews so far', () => {
    expect(reviewDecision(base)).toEqual({ request: REVIEW_REQUEST, record: requested });
    const old = { state: 'reviewed', fingerprint: OTHER, reviews: 0 };
    expect(reviewDecision({ ...base, marker: old }).request).toBe(REVIEW_REQUEST);
  });

  it('lets Claude stop when there is nothing to review', () => {
    expect(reviewDecision({ ...base, fingerprint: null })).toEqual(STOP);
  });

  it('asks once for the same changes, reviewed or skipped', () => {
    expect(reviewDecision({ ...base, marker: { ...requested, state: 'reviewed' } })).toEqual(STOP);
    expect(reviewDecision({ ...base, marker: requested })).toEqual(STOP);
  });

  it("counts a review's fixes as reviewed at the next stop", () => {
    expect(
      reviewDecision({
        stopHookActive: true,
        fingerprint: OTHER,
        marker: requested,
        reviewCount: 4,
      }),
    ).toEqual({ request: null, record: { state: 'reviewed', fingerprint: OTHER, reviews: 0 } });
  });

  it('records nothing when no review ran, e.g. the test hook sent Claude back', () => {
    expect(
      reviewDecision({
        stopHookActive: true,
        fingerprint: OTHER,
        marker: requested,
        reviewCount: 3,
      }),
    ).toEqual(STOP);
  });

  it('records nothing on a retry without a pending request', () => {
    expect(reviewDecision({ ...base, stopHookActive: true })).toEqual(STOP);
    expect(
      reviewDecision({
        ...base,
        stopHookActive: true,
        marker: { ...requested, state: 'reviewed' },
        reviewCount: 9,
      }),
    ).toEqual(STOP);
  });

  it('names the skill and the independent reviewer', () => {
    expect(REVIEW_REQUEST).toContain('/code-review');
    expect(REVIEW_REQUEST).toContain('subagent');
  });
});

describe('markers', () => {
  it('read back what they store', () => {
    const marker = { state: 'requested', fingerprint: 'c'.repeat(64), reviews: 2 };
    expect(parseMarker(formatMarker(marker))).toEqual(marker);
  });

  it.each([
    [null],
    [''],
    ['done abc 1'],
    [`reviewed ${'z'.repeat(64)} 1`],
    [`reviewed ${'a'.repeat(64)}`],
  ])('are null for %j', (text) => {
    expect(parseMarker(text)).toBeNull();
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

  /** Stops in `cwd`; `reviews` is how many code-review calls the transcript holds. */
  function stop(cwd, stopHookActive = false, reviews = 0) {
    const transcriptDir = mkdtempSync(join(tmpdir(), 'transcript-'));
    dirs.push(transcriptDir);
    const transcript = join(transcriptDir, 'transcript.jsonl');
    writeFileSync(transcript, Array(reviews).fill(reviewCall('code-review')).join('\n'));
    return spawnSync('node', [join(import.meta.dirname, 'requireCodeReview.js')], {
      input: JSON.stringify({ cwd, stop_hook_active: stopHookActive, transcript_path: transcript }),
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
    expect(stop(dir, true, 1).status).toBe(0);
    expect(stop(dir, false, 1).status).toBe(0);
    writeFileSync(join(dir, 'sphere.ts'), 'export const radius = 1;\n');
    expect(stop(dir).status).toBe(2);
  });

  it('counts the fixes as reviewed when the request came as a new turn', () => {
    const { dir } = repo();
    writeFileSync(join(dir, 'cube.ts'), 'export const side = 2;\n');
    expect(stop(dir).status).toBe(2);
    writeFileSync(join(dir, 'cube.ts'), 'export const side = 3;\n');
    expect(stop(dir, false, 1).status).toBe(0);
    expect(stop(dir, false, 1).status).toBe(0);
  });

  it('works in a linked worktree', () => {
    const { dir, git } = repo();
    const tree = join(dir, '..', `${dir.split('/').pop()}-tree`);
    dirs.push(tree);
    git('worktree', 'add', '-q', '-b', 'sphere-size', tree);
    writeFileSync(join(tree, 'cube.ts'), 'export const side = 2;\n');
    const result = stop(tree);
    expect(result.stderr).not.toContain('Review gate skipped');
    expect(result.status).toBe(2);
    expect(stop(tree).status).toBe(0);
  });

  it('counts new files outside the folder Claude is in', () => {
    const { dir } = repo();
    mkdirSync(join(dir, 'src'));
    writeFileSync(join(dir, 'sphere.ts'), 'export const radius = 1;\n');
    expect(stop(join(dir, 'src')).status).toBe(2);
    writeFileSync(join(dir, 'sphere.ts'), 'export const radius = 2;\n');
    expect(stop(join(dir, 'src')).status).toBe(2);
  });

  it('asks again next turn when the retry came without a review', () => {
    const { dir } = repo();
    writeFileSync(join(dir, 'cube.ts'), 'export const side = 2;\n');
    expect(stop(dir).status).toBe(2);
    // The test hook sent Claude back too; it fixed a test and stopped without reviewing.
    writeFileSync(join(dir, 'cube.ts'), 'export const side = 3;\n');
    expect(stop(dir, true).status).toBe(0);
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

  it('never blocks outside a repository, and says the gate was skipped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'no-repo-'));
    dirs.push(dir);
    const result = spawnSync('node', [join(import.meta.dirname, 'requireCodeReview.js')], {
      input: JSON.stringify({ cwd: dir }),
      encoding: 'utf8',
    });
    expect(result.status).toBe(0);
    expect(result.stderr).toContain('Review gate skipped');
  });
});

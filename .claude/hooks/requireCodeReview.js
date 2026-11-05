// Claude Code Stop hook (see .claude/settings.json). Sends Claude back to run /code-review
// when the branch has changes the independent reviewer has not seen. Exit code 2 keeps
// Claude working and shows it stderr. What was reviewed is kept in the git directory, so
// it is never committed and each clone keeps its own.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { changesFingerprint, reviewRequest } from './reviewGate.js';

const input = JSON.parse(readFileSync(0, 'utf8'));
const cwd = input.cwd ?? process.cwd();
const git = (...args) =>
  execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });

try {
  const marker = join(cwd, git('rev-parse', '--git-path', 'claude-reviewed-changes').trim());
  const fingerprint = changesFingerprint(git('diff', baseCommit()), untrackedFiles());
  const request = reviewRequest({
    stopHookActive: input.stop_hook_active === true,
    fingerprint,
    reviewedFingerprint: readMarker(marker),
  });
  if (request !== null) {
    // Recorded now: if Claude skips the review, the next stop must not block again.
    writeFileSync(marker, `${fingerprint}\n`);
    process.stderr.write(`${request}\n`);
    process.exit(2);
  }
} catch {
  // Not a repository, no base branch, or git failed: never trap Claude over a hook error.
}

/** Where the branch left the default branch; the default branch itself has nothing to review. */
function baseCommit() {
  for (const base of ['origin/main', 'main']) {
    try {
      return git('merge-base', 'HEAD', base).trim();
    } catch {
      // Try the next name.
    }
  }
  throw new Error('No base branch');
}

function untrackedFiles() {
  const paths = git('ls-files', '--others', '--exclude-standard', '-z').split('\0');
  return new Map(
    paths.filter((path) => path !== '').map((path) => [path, readFileSync(join(cwd, path))]),
  );
}

function readMarker(path) {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    return null;
  }
}

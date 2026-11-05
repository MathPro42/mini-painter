// When Claude must hand its work to the independent reviewer before it stops, as
// requireCodeReview.js applies it: once for every new state of the branch's changes.
import { createHash } from 'node:crypto';

export const REVIEW_REQUEST =
  'This branch has changes that no independent review has seen. Before you finish, run ' +
  '/code-review (it runs in a separate reviewer subagent with no view of this conversation). ' +
  'Then fix its Blocking and Should fix findings, run the checks, commit, and tell the user ' +
  'what the review found and what you changed. Skip it only if the user said not to review.';

/**
 * A short id for the branch's changes: everything that differs from the base, committed or
 * not, plus new files. `diff` is `git diff <base>`; `untracked` maps new paths to contents.
 * `null` when nothing changed.
 */
export function changesFingerprint(diff, untracked) {
  const paths = [...untracked.keys()].sort();
  if (diff === '' && paths.length === 0) {
    return null;
  }
  const hash = createHash('sha256').update(diff);
  for (const path of paths) {
    hash.update(`\0${path}\0`).update(untracked.get(path) ?? '');
  }
  return hash.digest('hex');
}

/**
 * Why Claude must not stop yet, or `null` when it may. It may when a stop hook already
 * sent it back this turn (so it never loops), when nothing changed, or when the reviewer
 * already saw exactly these changes.
 */
export function reviewRequest({ stopHookActive, fingerprint, reviewedFingerprint }) {
  if (stopHookActive || fingerprint === null || fingerprint === reviewedFingerprint) {
    return null;
  }
  return REVIEW_REQUEST;
}

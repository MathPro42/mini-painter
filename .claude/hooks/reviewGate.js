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
 * What the hook does at a stop. `marker` is what it recorded last time: the changes it
 * asked a review for (`requested`) or the ones a review covered (`reviewed`), or `null`.
 * Returns the request to send Claude back with (`null` to let it stop) and the marker to
 * record (`null` to keep the old one).
 *
 * - Changes nobody was asked to review: send Claude to the review, once.
 * - The stop after that review: the fixes it led to count as reviewed, so the next turn
 *   does not start a new review over them. Any other stop-hook retry just stops, so it
 *   never loops.
 */
export function reviewDecision({ stopHookActive, fingerprint, marker }) {
  if (stopHookActive) {
    const fixesReviewed = marker?.state === 'requested' && fingerprint !== null;
    return { request: null, record: fixesReviewed ? { state: 'reviewed', fingerprint } : null };
  }
  if (fingerprint === null || fingerprint === marker?.fingerprint) {
    return { request: null, record: null };
  }
  return { request: REVIEW_REQUEST, record: { state: 'requested', fingerprint } };
}

/** A marker as the hook stores it: `<state> <fingerprint>`. */
export function formatMarker({ state, fingerprint }) {
  return `${state} ${fingerprint}\n`;
}

/** A stored marker, or `null` for an unknown one (it then asks again). */
export function parseMarker(text) {
  const match = /^(requested|reviewed) ([0-9a-f]{64})\s*$/.exec(text ?? '');
  return match === null ? null : { state: match[1], fingerprint: match[2] };
}

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
 * How many times the session ran the code-review skill, from its transcript (JSON lines).
 * The proof a review happened: a stop-hook retry alone proves nothing, since any Stop hook
 * (the test run too) can cause one.
 */
export function countReviews(transcript) {
  let count = 0;
  for (const line of transcript.split('\n')) {
    if (!line.includes('code-review')) {
      continue;
    }
    try {
      const content = JSON.parse(line).message?.content;
      const blocks = Array.isArray(content) ? content : [{ type: 'text', text: content }];
      count += blocks.filter((block) => isReviewCall(block) || isTypedReview(block)).length;
    } catch {
      // A partly written last line: it is read in full at the next stop.
    }
  }
  return count;
}

/** The user typed `/code-review`: the transcript records the command by name. */
const TYPED_REVIEW = /<command-name>\/(?:[\w-]+:)?code-review<\/command-name>/;

function isTypedReview(block) {
  return block?.type === 'text' && typeof block.text === 'string' && TYPED_REVIEW.test(block.text);
}

function isReviewCall(block) {
  const skill = block?.input?.skill;
  return (
    block?.type === 'tool_use' &&
    block.name === 'Skill' &&
    (skill === 'code-review' || skill?.endsWith(':code-review') === true)
  );
}

/**
 * What the hook does at a stop. `marker` is what it recorded last time: the changes it
 * asked a review for and how many reviews had run then (`requested`), or the changes a
 * review covered (`reviewed`), or `null`. `reviewCount` is how many have run now.
 * Returns the request to send Claude back with (`null` to let it stop) and the marker to
 * record (`null` to keep the old one).
 *
 * - Changes nobody was asked to review: send Claude to the review, once.
 * - The first stop after a review ran since the request: the fixes it led to count as
 *   reviewed, so no new review starts over them. This goes by the transcript, not by
 *   `stopHookActive`: some hosts deliver the request as a new turn, without the flag.
 *   Without a review, nothing is recorded, and changed code is asked about again.
 * - A stop-hook retry never blocks again, so it never loops.
 */
export function reviewDecision({ stopHookActive, fingerprint, marker, reviewCount }) {
  const reviewRan = marker?.state === 'requested' && reviewCount > marker.reviews;
  if (reviewRan && fingerprint !== null) {
    return { request: null, record: reviewed(fingerprint) };
  }
  if (stopHookActive || fingerprint === null || fingerprint === marker?.fingerprint) {
    return { request: null, record: null };
  }
  return {
    request: REVIEW_REQUEST,
    record: { state: 'requested', fingerprint, reviews: reviewCount },
  };
}

function reviewed(fingerprint) {
  return { state: 'reviewed', fingerprint, reviews: 0 };
}

/** A marker as the hook stores it: `<state> <fingerprint> <reviews>`. */
export function formatMarker({ state, fingerprint, reviews }) {
  return `${state} ${fingerprint} ${String(reviews)}\n`;
}

/** A stored marker, or `null` for an unknown one (it then asks again). */
export function parseMarker(text) {
  const match = /^(requested|reviewed) ([0-9a-f]{64}) (\d+)\s*$/.exec(text ?? '');
  return match === null
    ? null
    : { state: match[1], fingerprint: match[2], reviews: Number(match[3]) };
}

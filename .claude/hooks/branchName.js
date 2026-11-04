// The branch rule of CLAUDE.md (principle 8), as checkBranchName.js applies it to the
// shell commands Claude runs: work is committed on, and pushed to, branches named after
// their feature only.

/** Lowercase words joined by hyphens, at least two: `fix-autosave-across-tabs`. */
const FEATURE_BRANCH = /^[a-z0-9]+(?:-[a-z0-9]+)+$/;

/**
 * `git commit` or `git push` where a shell command starts, after any `-C`/`-c` options,
 * and its words up to the next separator. Text that only mentions one, such as a quoted
 * message, does not count.
 */
const COMMIT_OR_PUSH =
  /(?:^|[;&|(\n]|\b(?:then|do)\b)\s*git(?:\s+-[Cc]\s+\S+)*\s+(commit|push)\b([^;&|\n]*)/g;

/** A heredoc's body, up to its closing delimiter: the text of a `git commit -F - <<'EOF'`. */
const HEREDOC_BODY = /(<<-?\s*(['"]?)(\w+)\2[^\n]*)\n[\s\S]*?\n[ \t]*\3[ \t]*(?=\n|$)/g;

/** Push words after which nothing is written to a branch. */
const NO_BRANCH_PUSH = new Set(['--delete', '-d', '--tags']);

/** Whether `name` says what its branch is for. `main` is the one exception. */
export function isFeatureBranch(name) {
  return name === 'main' || FEATURE_BRANCH.test(name);
}

/**
 * Why `command` must not run, or `null` when it may: it commits on, or pushes to, a
 * branch whose name breaks the rule. `currentBranch` returns the checked-out branch
 * (`''` when detached); it is called only when a command needs it.
 */
export function branchNameProblem(command, currentBranch) {
  const shellText = command.replace(HEREDOC_BODY, '$1');
  for (const [, action, words] of shellText.matchAll(COMMIT_OR_PUSH)) {
    const branches = action === 'commit' ? [currentBranch()] : pushedBranches(words, currentBranch);
    const broken = branches.find((name) => name !== '' && !isFeatureBranch(name));
    if (broken !== undefined) {
      return explain(broken, action);
    }
  }
  return null;
}

/** The branches a push writes, from the words after `git push`. Deletions and tags write none. */
function pushedBranches(words, currentBranch) {
  const args = withoutRedirections(words);
  const parts = args.split(/\s+/).filter((part) => part !== '');
  if (parts.some((part) => NO_BRANCH_PUSH.has(part))) {
    return [];
  }
  // A name the shell computes ("$BRANCH", $(git branch --show-current)) is most likely
  // the current branch, so that is what gets checked.
  if (/[$`]/.test(args)) {
    return [currentBranch()];
  }
  const [, ...refspecs] = parts.filter((part) => !part.startsWith('-')).map(unquote);
  if (refspecs.length === 0) {
    return [currentBranch()];
  }
  return refspecs.flatMap((refspec) => refspecTarget(refspec, currentBranch));
}

/** The branch a refspec (`name`, `src:dst`, `+src:dst`, `:dst`) writes, if any. */
function refspecTarget(refspec, currentBranch) {
  const [source = '', target = source] = refspec.replace(/^\+/, '').split(':');
  if (source === '' || target.startsWith('refs/tags/')) {
    return [];
  }
  return [target === 'HEAD' ? currentBranch() : target.replace(/^refs\/heads\//, '')];
}

/**
 * `words` without shell redirections, which are not git arguments: `2>&1` (cut at `&`
 * by COMMIT_OR_PUSH), `>out.log`, `2> /dev/null`, `<<EOF`. As in the shell, a number
 * is a file descriptor only when it starts a word.
 */
function withoutRedirections(words) {
  return words.replace(/(^|\s)\d+(?=[<>])/g, '$1').replace(/[<>]+\s*[^\s<>]*/g, ' ');
}

function unquote(word) {
  return word.replace(/^['"]|['"]$/g, '');
}

function explain(branch, action) {
  const doing = action === 'commit' ? 'Committing on' : 'Pushing to';
  return (
    `${doing} "${branch}" is blocked: work goes on a branch named after its feature ` +
    '(CLAUDE.md, principle 8), in lowercase words joined by hyphens, such as ' +
    'fix-autosave-across-tabs. Rename this branch with `git branch -m <feature-name>`, ' +
    'or create one from main, then try again.'
  );
}

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { branchNameProblem, isFeatureBranch } from './branchName.js';

const GENERATED = 'claude/gracious-bohr-1wwpis';
const FEATURE = 'fix-autosave-across-tabs';

/** The problem with `command` while `current` is checked out. */
const check = (command, current = FEATURE) => branchNameProblem(command, () => current);

describe('isFeatureBranch', () => {
  it('accepts lowercase words joined by hyphens, and main', () => {
    expect(isFeatureBranch(FEATURE)).toBe(true);
    expect(isFeatureBranch('save-png')).toBe(true);
    expect(isFeatureBranch('main')).toBe(true);
  });

  it('rejects generated, one-word and differently written names', () => {
    for (const name of [GENERATED, 'fixes', 'Fix-Autosave', 'fix_autosave', 'fix--autosave', '']) {
      expect(isFeatureBranch(name)).toBe(false);
    }
  });
});

describe('branchNameProblem', () => {
  it('lets other commands run without reading the branch', () => {
    const current = vi.fn(() => GENERATED);
    expect(branchNameProblem('git status && git log --oneline -3', current)).toBeNull();
    expect(current).not.toHaveBeenCalled();
  });

  it('blocks a commit on a branch with a generated name, naming it and the fix', () => {
    const problem = check('git commit -m "Paint"', GENERATED);
    expect(problem).toContain(`Committing on "${GENERATED}"`);
    expect(problem).toContain('git branch -m <feature-name>');
    expect(check('git commit -m "Paint"')).toBeNull();
  });

  it('finds commits inside longer commands and after -C or -c', () => {
    expect(check('cd /repo && git add . && git commit -q -F -', GENERATED)).not.toBeNull();
    expect(check('git -C /repo -c core.pager=cat commit --amend', GENERATED)).not.toBeNull();
  });

  it('lets a detached HEAD commit', () => {
    expect(check('git commit -m "Paint"', '')).toBeNull();
  });

  it('checks the branch a push names', () => {
    expect(check(`git push -u origin ${GENERATED}`)).toContain(`Pushing to "${GENERATED}"`);
    expect(check(`git push -u origin ${FEATURE}`, GENERATED)).toBeNull();
    expect(check(`git push origin "${FEATURE}" 'save-png'`)).toBeNull();
  });

  it('reads the target of src:dst, forced and refs/heads/ refspecs', () => {
    expect(check(`git push origin ${FEATURE}:fixes`)).toContain('"fixes"');
    expect(check(`git push origin +HEAD:refs/heads/${FEATURE}`, GENERATED)).toBeNull();
  });

  it('checks the current branch for a bare push, HEAD and names the shell computes', () => {
    for (const command of [
      'git push',
      'git push -u origin HEAD',
      'git push -u origin "$(git branch --show-current)"',
      'git push -u origin "$BRANCH"',
    ]) {
      expect(check(command, GENERATED)).not.toBeNull();
      expect(check(command)).toBeNull();
    }
  });

  it('lets deletions and tag pushes through', () => {
    for (const command of [
      `git push origin --delete ${GENERATED}`,
      `git push -d origin ${GENERATED}`,
      `git push origin :${GENERATED}`,
      'git push --tags',
      'git push origin refs/tags/v1.0',
    ]) {
      expect(check(command, GENERATED)).toBeNull();
    }
  });

  it('lets main be pushed', () => {
    expect(check('git push origin main', GENERATED)).toBeNull();
  });
});

describe('checkBranchName.js', () => {
  const repo = mkdtempSync(join(tmpdir(), 'branch-name-'));
  spawnSync('git', ['init', '-q', '-b', GENERATED, repo]);
  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  /** Runs the hook on a Bash tool call made in `repo`. */
  const runHook = (command) =>
    spawnSync(process.execPath, [join(import.meta.dirname, 'checkBranchName.js')], {
      input: JSON.stringify({ tool_name: 'Bash', tool_input: { command }, cwd: repo }),
      encoding: 'utf8',
    });

  it('blocks with exit code 2 and tells Claude why on stderr', () => {
    const result = runHook('git commit -m "Paint"');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`Committing on "${GENERATED}"`);
  });

  it('lets other commands run', () => {
    expect(runHook('ls').status).toBe(0);
    expect(runHook(`git push -u origin ${FEATURE}`).status).toBe(0);
  });
});

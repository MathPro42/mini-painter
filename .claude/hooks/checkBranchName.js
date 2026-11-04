// Claude Code PreToolUse hook for Bash (see .claude/settings.json). Reads the tool call
// from stdin and blocks a command that commits on, or pushes to, a branch not named after
// its feature. Exit code 2 stops the command and shows stderr to Claude.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { branchNameProblem } from './branchName.js';

const input = JSON.parse(readFileSync(0, 'utf8'));
let branch;
const currentBranch = () => {
  branch ??= readCurrentBranch(input.cwd);
  return branch;
};

const problem = branchNameProblem(input.tool_input?.command ?? '', currentBranch);
if (problem !== null) {
  process.stderr.write(`${problem}\n`);
  process.exit(2);
}

function readCurrentBranch(cwd) {
  try {
    return execFileSync('git', ['branch', '--show-current'], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // Not in a repository: there is no branch to check.
    return '';
  }
}

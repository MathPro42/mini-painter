import { execFileSync } from 'node:child_process';

/**
 * The commit the build comes from: CI's `GITHUB_SHA`, else the local checkout's
 * HEAD, else "dev". Both builds of one deploy share it, so the offline copy can
 * tell whether the site has moved on.
 */
export function readAppVersion(): string {
  const sha = process.env.GITHUB_SHA ?? gitHead();
  return sha === null ? 'dev' : sha.slice(0, 12);
}

function gitHead(): string | null {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

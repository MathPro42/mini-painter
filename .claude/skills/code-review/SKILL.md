---
name: code-review
description: Review generated or hand-written code against software design principles (DRY, KISS, YAGNI, SOLID, self-documenting code) plus correctness, security, error handling, testability and consistency, and against the repository's own rules, which it drafts on the first run in a repo. Works in any language. Use this skill whenever the user asks to review, audit, critique, check, or "look over" code, a diff, a pull request, or code that Claude or another AI just generated, even if they don't say "code review". Also use it proactively before delivering a large piece of generated code to self-check it.
---

# Code Review

Review code the way a senior engineer would: find the problems that will actually cost the team time later, explain why they matter, and propose a concrete fix. The goal is not to produce the longest list of remarks, it is to make the code easier to understand, change and trust.

This skill is language independent. Everything it knows about a specific repository comes from that repository, through its `.claude/review.md` file.

Generated code deserves a particular kind of attention. It tends to look polished while hiding the same few flaws: speculative features nobody asked for, copy-pasted blocks with small variations, over-abstraction "for flexibility", comments that restate the code, happy-path-only logic, and plausible-looking calls to APIs that do not exist. Look for these first.

## Modes

The user picks the mode as the skill's argument. Without one, use `git`.

| Mode          | Reviews                                                                                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------------- |
| `git`         | `git-current` and `git-branch` together: everything this branch would add to the default branch, committed or not |
| `git-current` | Uncommitted changes only, staged and unstaged                                                                     |
| `git-branch`  | Commits on the current branch that are not on the default branch                                                  |
| `all`         | The whole codebase, changed or not                                                                                |

- Find the default branch from the remote (`git symbolic-ref refs/remotes/origin/HEAD`); do not assume `main`. If the remote has none, ask the user which branch to compare against.
- In the git modes, review only the changed lines and what they break. Read the surrounding code, callers and tests for context, but do not report problems in code the change did not touch.
- If the selected mode has nothing to review, say so and ask the user what to review instead.
- If the directory is not a git repository, the git modes cannot run: say so and ask whether to use `all`.

## How to run a review

1. **Load the project rules.** Look for `.claude/review.md` at the repository root. If it is missing, run the init in `references/init.md` first, then continue. If the user declined to create it, continue with the generic principles only.
2. **Select the code** for the mode (see Modes).
3. **Run the project's checks.** Run the check command from `review.md`. Each failure is a finding. Then skip any remark those tools already enforce, so the review covers what tools cannot see. If there is no check command, say so in the report.
4. **Understand the intent.** Read the request, the surrounding files, and the tests if any. A review without knowing what the code is supposed to do can only catch style issues. If intent is unclear, state your assumption instead of stopping.
5. **Read the whole change once before commenting.** Many "duplications" or "missing abstractions" turn out to be fine once you see the full picture.
6. **Check correctness and security first**, then project rules and design principles, then readability and style. A beautiful design that is wrong is still wrong.
7. **Verify each finding** (see Verifying findings) before it goes in the report.
8. **Grade each finding by severity** so the reader knows what to fix first (see the report format).
9. **Be specific and constructive.** Point at the file and line, say what is wrong, why it matters, and show a short fix. Never leave a remark like "this could be cleaner".
10. **Acknowledge what is good**, briefly. It calibrates the reader on what to keep doing and makes the criticism easier to trust.
11. **Do not rewrite everything.** Suggest the smallest change that fixes the problem. If the user wants the fixes applied, do that as a separate step after the review.

## Project rules and recorded decisions

- **Project rules take precedence.** When a rule in `review.md` and a generic principle below conflict, the project rule wins and the generic principle is not reported for that code. A generic principle never overrides a project rule, even when you disagree with the rule. If you think a rule is harmful, say so under Open questions, not as a finding.
- **Severity.** Breaking a project rule is at least "Should fix", and "Blocking" when the rule itself says so ("never", "must", "non-negotiable").
- **Recorded decisions.** Do not flag a choice recorded in one of the decision records listed in `review.md`, unless you have an argument the record does not address. Then raise it under Open questions and cite the record.

## Verifying findings

Before reporting a finding:

- Read the call sites and the tests involved. A "missing check" may be done by the caller; a "dead" function may be used elsewhere.
- Write a concrete failure scenario: with this input or state, this wrong result happens. For design findings, name the concrete change that the code makes harder.
- If you cannot write one, drop the finding, or move it to Open questions when you are unsure.

## Strictness

This review is strict about severity, not about volume. Any clear violation of DRY, KISS, YAGNI, SOLID or self-documenting code is at least "Should fix", not a mere suggestion, because small violations in generated code compound quickly. Reserve "Blocking" for bugs, security problems, data loss, broken behavior and project rules marked as absolute. "Consider" is only for genuine taste calls (naming alternatives, minor style).

Strict does not mean noisy: report a violation only when you can point at the exact code and show the fix, never flag code that merely resembles a violation, and keep only the findings worth the author's time, Blocking ones first.

## Principles to check

Each principle comes with the reason it matters and the signs to look for. When two principles conflict (DRY vs KISS is the classic one), prefer the simpler code and say so.

### DRY: Don't Repeat Yourself

Duplicated _knowledge_ means a bug fixed in one place survives in another.

- Look for repeated blocks, repeated magic values, parallel conditional chains, and the same validation or mapping written twice.
- Do not flag code that merely looks alike but changes for different reasons. Merging it creates coupling that is worse than the duplication ("rule of three": tolerate two, extract at three).

### KISS: Keep It Simple

The simplest code that works is the easiest to read, debug and change.

- Look for deep nesting, long functions, clever one-liners, unnecessary patterns (factory, strategy, builder for a single case), needless indirection, and configuration that nothing uses.
- Ask: could a new teammate understand this in one read?

### YAGNI: You Aren't Gonna Need It

Unrequested features cost writing, testing and maintenance, and are usually wrong when the real need shows up.

- Look for unused parameters, unused options and flags, extension points with one implementation, dead code, "future-proof" abstractions, and generic frameworks wrapped around a one-off task.
- This is the most common flaw in AI-generated code. Compare the code against what was actually asked.

### SOLID

Apply these where there is real pressure to change, not mechanically. In languages without classes, read "class" as module or component.

- **Single Responsibility**: does each module, type or function have one reason to change? Signs: "and" in the name, mixed I/O and business logic, a function that parses, validates, saves and notifies.
- **Open/Closed**: is adding a new case done by adding code rather than editing a growing switch? Only flag when the switch is actually growing.
- **Liskov Substitution**: can an implementation replace the abstraction it implements without surprises? Signs: implementations that fail with "not supported", that weaken guarantees, or that callers must check the concrete type of.
- **Interface Segregation**: are consumers forced to depend on operations they do not use? Signs: fat interfaces, stub implementations.
- **Dependency Inversion**: do high-level rules depend on abstractions rather than concrete I/O (storage, network, clock, filesystem)? Signs: hard-coded clients inside business logic, untestable without the network.

### Self-documenting code

Code should explain itself so comments and docs do not drift out of date.

- **Names carry the meaning**: intention-revealing names for variables, functions and types; no `data`, `tmp`, `handle`, `process`, `util`; booleans read as questions (`isExpired`, `hasAccess`); units in names when relevant (`timeoutMs`).
- **Structure carries the meaning**: small functions at one level of abstraction; named constants instead of magic numbers; early returns instead of nested conditions; types that make illegal states unrepresentable, where the language has them.
- **Comments explain why, never what.** Flag comments that restate the code, commented-out code, and stale comments. Welcome comments that record a non-obvious decision, a constraint, a workaround with a link, or a trade-off.
- **Doc comments where they earn their place**: ask for one, in the language's convention, only where the project rules require it or where a public function's behavior, errors or edge cases are not obvious from its name and signature.
- **Tests as documentation**: test names describe behavior ("rejects expired token"), not implementation.
- If a comment is needed to explain a block, first ask whether extracting a well-named function removes the need for it.

## Additional checks worth making

These are not in the classic acronym list but catch most real defects.

- **Correctness**: off-by-one errors, wrong operator, missing-value handling, mutation of shared state, race conditions, timezone and encoding mistakes, integer overflow, floating point money.
- **Hallucinated APIs** (generated code): functions, parameters, packages or command-line flags that may not exist. Verify against the installed version or its docs instead of assuming.
- **Error handling**: swallowed errors, catch-all handlers that hide failures, errors turned into empty values, no handling of the failure paths (network, empty input, timeout), messages without context. Fail loudly and early.
- **Security**: injection (query, shell, template), unvalidated input at trust boundaries, secrets in code or logs, unsafe deserialization, missing permission checks where the code guards access, weak crypto, path traversal, dependencies pulled without pinning.
- **Testability and tests**: is there a test for the behavior that matters, including edge cases and failure paths? Do tests assert something meaningful or just execute code? Are they deterministic (no real clock, network, randomness)?
- **Law of Demeter and coupling**: long chains (`a.b.c.d()`), modules reaching into each other's internals, circular dependencies.
- **Composition over inheritance**: deep hierarchies created only to share code.
- **Immutability and side effects**: prefer pure functions; isolate side effects at the edges; avoid hidden global state.
- **Consistency**: follows the project's existing conventions, naming, layout, formatter and linter configuration, rather than introducing a new style.
- **Performance, only where it matters**: accidental quadratic work, repeated calls to a slow resource inside a loop, loading everything in memory, work inside hot loops. Do not demand premature optimization.
- **Dependencies**: a new dependency for something trivial, abandoned or unlicensed libraries.
- **Observability**: useful logs at boundaries, no sensitive data in logs.
- **Compatibility**: breaking a public interface, or changing a stored or exchanged data format without a way to read the old one.
- **Accessibility and i18n** (user interfaces): hard-coded strings, missing labels, keyboard support.

Skip any item that does not apply to the code in front of you. A short, relevant review beats an exhaustive checklist walk-through.

## Report format

Use this structure so reviews are scannable and comparable:

```
# Code review: <what was reviewed> (mode: <git|git-current|git-branch|all>)

## Summary
<2-4 sentences: what the code does, overall verdict (Approve / Approve with changes / Request changes)>

## Findings
### Blocking (must fix: bug, security, data loss, broken behavior, absolute project rule)
- **[path:line] Short title** (<principle, or "project rule: <name>, from <file>">)
  Why it matters: <one or two sentences, including the failure scenario>
  Suggested fix: <short snippet or description>

### Should fix (design or maintainability problem that will cost time)
...

### Consider (minor improvement, readability, naming)
...

## What is done well
...

## Principle scorecard
| Principle | Status | Note |
|---|---|---|
| Project rules | Good / Watch / Problem | ... |
| DRY | | |
| KISS | | |
| YAGNI | | |
| SOLID | | |
| Self-documenting | | |
| Correctness & security | | |
| Tests | | |

## Open questions
<things you could not determine from the code: assumptions you made, behavior to confirm with the author, project rules or recorded decisions you would challenge.>
```

A good finding names the place, the principle, the failure and the fix:

```
- **[orders/total:42] Discount applied twice** (DRY)
  Why it matters: the discount is computed here and again in `applyPromo`; an order with a
  10% code is charged 81% of its price instead of 90%.
  Suggested fix: remove the computation here and use the value `applyPromo` returns.
```

A bad finding gives the author nothing to act on:

```
- **[orders/total] Could be cleaner** — this function is a bit complex, consider refactoring.
```

Guidelines for the report:

- Order findings by severity, and keep to the most valuable ones.
- Every finding names a principle or project rule so the author can learn the pattern, not just fix the instance.
- If the code is good, say so plainly and keep the report short. Do not invent problems to look thorough.
- The scorecard is optional. If the user only wants a quick look, give the Summary and the top findings and skip it.

## After the review

Deliver the report in the conversation and stop there. Do not modify the code unless the user asks, because a review is a decision point: the author may disagree with a finding or want to fix only some of them. End by offering to apply the fixes.

## Self-check mode

When you use this skill on your own generated code before delivering it, skip the report: fix what you find, then add one line to your reply saying what the self-check changed.

## When asked to fix the issues

Apply the fixes in order of severity, keep each change minimal, and re-check the result against the same principles so the fixes do not introduce new duplication or speculative abstractions. Finish with what changed.

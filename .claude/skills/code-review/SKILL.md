---
name: code-review
description: Review generated or hand-written code against software design principles (DRY, KISS, YAGNI, SOLID, self-documenting code) plus correctness, security, error handling, testability and consistency. Use this skill whenever the user asks to review, audit, critique, check, or "look over" code, a diff, a pull request, or code that Claude or another AI just generated, even if they don't say "code review". Also use it proactively before delivering a large piece of generated code to self-check it.
---
 
# Code Review
 
Review code the way a senior engineer would: find the problems that will actually cost the team time later, explain why they matter, and propose a concrete fix. The goal is not to produce the longest list of remarks, it is to make the code easier to understand, change and trust.
 
Generated code deserves a particular kind of attention. It tends to look polished while hiding the same few flaws: speculative features nobody asked for, copy-pasted blocks with small variations, over-abstraction "for flexibility", comments that restate the code, happy-path-only logic, and plausible-looking calls to APIs that do not exist. Look for these first.
 
## How to run a review
 
1. **Understand the intent.** Read the request, the surrounding files, and the tests if any. A review without knowing what the code is supposed to do can only catch style issues. If intent is unclear, state your assumption instead of stopping.
2. **Read the whole change once before commenting.** Many "duplications" or "missing abstractions" turn out to be fine once you see the full picture.
3. **Check correctness and security first**, then design principles, then readability and style. A beautiful design that is wrong is still wrong.
4. **Grade each finding by severity** so the reader knows what to fix first (see the report format).
5. **Be specific and constructive.** Point at the file and line, say what is wrong, why it matters, and show a short fix. Never leave a remark like "this could be cleaner".
6. **Acknowledge what is good**, briefly. It calibrates the reader on what to keep doing and makes the criticism easier to trust.
7. **Do not rewrite everything.** Suggest the smallest change that fixes the problem. If the user wants the fixes applied, do that as a separate step after the review.
## Strictness
 
This review is strict. Any clear violation of DRY, KISS, YAGNI, SOLID or self-documenting code is at least "Should fix", not a mere suggestion, because small violations in generated code compound quickly. Reserve "Blocking" for bugs, security problems, data loss and broken behavior. "Consider" is only for genuine taste calls (naming alternatives, minor style). Strict does not mean noisy: report a violation only when you can point at the exact code and show the fix, and never flag code that merely resembles a violation.
 
## Principles to check
 
Each principle comes with the reason it matters and the signs to look for. When two principles conflict (DRY vs KISS is the classic one), prefer the simpler code and say so.
 
### DRY: Don't Repeat Yourself
Duplicated *knowledge* means a bug fixed in one place survives in another.
- Look for repeated blocks, repeated magic values, parallel if/else chains, and the same validation or mapping written twice.
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
Apply these where there is real pressure to change, not mechanically.
- **Single Responsibility**: does each module/class/function have one reason to change? Signs: "and" in the name, mixed I/O and business logic, a function that parses, validates, saves and notifies.
- **Open/Closed**: is adding a new case done by adding code rather than editing a growing switch? Only flag when the switch is actually growing.
- **Liskov Substitution**: can subtypes replace their base type without surprises? Signs: overrides that throw "not supported", that weaken guarantees, or that need `isinstance` checks by callers.
- **Interface Segregation**: are consumers forced to depend on methods they do not use? Signs: fat interfaces, stub implementations.
- **Dependency Inversion**: do high-level rules depend on abstractions rather than concrete I/O (database, HTTP, clock, filesystem)? Signs: hard-coded clients inside business logic, untestable without the network.
### Self-documenting code
Code should explain itself so comments and docs do not drift out of date.
- **Names carry the meaning**: intention-revealing names for variables, functions and types; no `data`, `tmp`, `handle`, `process`, `util`; booleans read as questions (`isExpired`, `hasAccess`); units in names when relevant (`timeoutMs`).
- **Structure carries the meaning**: small functions at one level of abstraction; named constants instead of magic numbers; early returns instead of nested conditions; types that make illegal states unrepresentable.
- **Comments explain why, never what.** Flag comments that restate the code, commented-out code, and stale comments. Welcome comments that record a non-obvious decision, a constraint, a workaround with a link, or a trade-off.
- **Public surface is documented**: public functions/classes/modules have a short docstring or doc comment stating purpose, parameters, return value, errors raised, and a usage example when the behavior is not obvious. Follow the language's convention (docstrings, JSDoc/TSDoc, Javadoc, rustdoc...).
- **Tests as documentation**: test names describe behavior ("rejects expired token"), not implementation.
- If a comment is needed to explain a block, first ask whether extracting a well-named function removes the need for it.
## Additional checks worth making
 
These are not in the classic acronym list but catch most real defects.
 
- **Correctness**: off-by-one errors, wrong operator, null/undefined handling, mutation of shared state, race conditions, timezone and encoding mistakes, integer overflow, floating point money.
- **Hallucinated APIs** (generated code): functions, parameters, packages or CLI flags that may not exist. Verify against docs or the installed version when in doubt instead of assuming.
- **Error handling**: swallowed exceptions, bare `except`/`catch`, errors turned into `null`, no handling of the failure paths (network, empty input, timeout), messages without context. Fail loudly and early.
- **Security**: injection (SQL, shell, template), unvalidated input at trust boundaries, secrets in code or logs, unsafe deserialization, missing authn/authz checks, weak crypto, path traversal, dependencies pulled without pinning.
- **Testability and tests**: is there a test for the behavior that matters, including edge cases and failure paths? Do tests assert something meaningful or just execute code? Are they deterministic (no real clock, network, randomness)?
- **Law of Demeter and coupling**: long chains (`a.b.c.d()`), modules reaching into each other's internals, circular dependencies.
- **Composition over inheritance**: deep hierarchies created only to share code.
- **Immutability and side effects**: prefer pure functions; isolate side effects at the edges; avoid hidden global state.
- **Consistency**: follows the project's existing conventions, naming, layout, formatter and linter configuration, rather than introducing a new style.
- **Performance, only where it matters**: accidental O(n²), N+1 queries, loading everything in memory, work inside hot loops. Do not demand premature optimization.
- **Dependencies**: a new dependency for something trivial, abandoned or unlicensed libraries.
- **Observability**: useful logs at boundaries, no sensitive data in logs.
- **Backward compatibility and migrations**: breaking public APIs, schema changes without a migration path.
- **Accessibility and i18n** (UI code): hard-coded strings, missing labels, keyboard support.
Skip any item that does not apply to the code in front of you. A short, relevant review beats an exhaustive checklist walk-through.
 
## Report format
 
Use this structure so reviews are scannable and comparable:
 
```
# Code review: <what was reviewed>
 
## Summary
<2-4 sentences: what the code does, overall verdict (Approve / Approve with changes / Request changes)>
 
## Findings
### Blocking (must fix: bug, security, data loss, broken behavior)
- **[path:line] Short title** (principle: <DRY|KISS|YAGNI|SRP|...>)
  Why it matters: <one or two sentences>
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
| DRY | good / carefull / NOT GOOD | ... |
| KISS | | |
| YAGNI | | |
| SOLID | | |
| Self-documenting | | |
| Correctness & security | | |
| Tests | | |
 
## Open questions
<things you could not determine from the code: assumptions you made, behavior to confirm with the author.>
```
 
Guidelines for the report:
- Order findings by severity, and keep to the most valuable ones.
- Every finding names a principle or category so the author can learn the pattern, not just fix the instance.
- If the code is good, say so plainly and keep the report short. Do not invent problems to look thorough.
- If the user only wants a quick look, give the Summary and the top findings and skip the scorecard.
## After the review
 
Deliver the report in the conversation and stop there. Do not modify the code unless the user asks, because a review is a decision point: the author may disagree with a finding or want to fix only some of them. End by offering to apply the fixes.
 
## When asked to fix the issues
 
Apply the fixes in order of severity, keep each change minimal, and re-check the result against the same principles so the fixes do not introduce new duplication or speculative abstractions. Finish with what changed.
 

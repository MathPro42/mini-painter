# Init: drafting a repository's review rules

Run this when `.claude/review.md` is missing. It runs once per repository; afterwards the review loads the file.

## 1. Read the repository

Take rules only from what the repository itself states. Never assume a convention from the language or framework.

- **Agent and contributor docs**: `CLAUDE.md`, `AGENTS.md`, `CONTRIBUTING.md`, `README`, and the architecture notes they point to.
- **Tool configuration**: the configuration of whatever linters, formatters and type checkers the repository has.
- **CI workflows**: the files that define what must pass before a merge.
- **Decision records**: ADR folders, a decisions document, or a "decision log" section in one of the docs.

## 2. Draft the file

Use this template. Every rule names the file it came from, so the user can check it.

```
# Review rules

Drafted by the code-review skill from this repository's docs and configs. Edit freely.

## Check command
<the command that runs the project's checks, as CI runs them, or "none found">
Covers: <short list of the rules the tools enforce>

## Project rules
- <rule, in one line> (source: <file>)
- ...

## Decision records
- <path to each decision record>
```

- Write down a rule only when a doc or config states it.
- A rule a tool enforces is not a project rule. Name it once in the **Covers** list under the check command, and not under Project rules.
- Keep a rule under Project rules only for the part no tool checks. For example, from "layer imports are lint-enforced; move the code, never disable the rule", keep only "never disable a lint rule to get past it".
- Mark a rule as absolute when its source does ("never", "must", "non-negotiable").
- If a section has nothing, write "none found" instead of guessing.

## 3. Ask before writing

Before showing the draft, check each project rule against the tool configs you read, and move any rule they enforce to the Covers list.

Show the draft to the user and ask them to approve or edit it.

- **Approved**: write it to `.claude/review.md`. Never commit it; the user decides whether to.
- **Declined**: do not write it. Run this review with the generic principles only, and offer the init again on the next run.

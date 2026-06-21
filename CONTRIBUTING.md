# Contributing to ClawCraft

Thanks for your interest in contributing! This project aims to be the mineflayer equivalent for Bedrock Edition.

## Getting Started

```bash
git clone https://github.com/<your-fork>/clawcraft.git
cd clawcraft
npm install
npm test
```

## Guidelines

1. **Read `AGENTS.md`** — it covers architecture, conventions, and gotchas.
2. **Keep stdout sacred** — only JSON via `output()`. Logs go to stderr via `log()`.
3. **Put logic in pure modules** — new features belong in testable modules, not `bot.js`.
4. **Add tests** — all new logic needs unit tests. New commands need live tests too.
5. **Run `npm test`** before submitting — all tests must pass.

## Adding a Command

See the "Adding a new command" section in `AGENTS.md` for the full checklist.

## Commit Messages

Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.

## Code Style

- ESM modules, Node >=18
- No external test dependencies (built-in `node --test`)
- Immutable state updates (spread pattern, pure functions)

## Reporting Issues

Use the issue templates — bug reports and feature requests are both welcome.

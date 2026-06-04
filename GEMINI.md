# Project Instructions for AGY

## Git Rules

- **Never use `git add -f` or `git add --force`.**  
  If a file is blocked by `.gitignore`, skip the commit silently. Do not attempt to force-add ignored files.

- **Respect `.gitignore` at all times.**  
  Files and directories listed in `.gitignore` (e.g. `docs/`, `node_modules/`, `.env`) are intentionally excluded from version control. When a `git add` fails due to `.gitignore`, treat it as a no-op and continue without error.

- **Allowed git commands**: `git status`, `git log`, `git add <tracked-file>`, `git commit`.  
  Do not modify `.gitignore` to work around exclusions.

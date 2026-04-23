# Codex Spelunker

## Project Overview

Codex Spelunker is a local-first browser for Codex session history. It started from OpenAI Euphony, but this repo is now focused on browsing, filtering, searching, and analyzing the sessions, projects, timelines, and usage patterns stored in a local `~/.codex` history.

## Status

in-development

## Immediate Goal

Make Codex Spelunker the default reliable browser for local Codex history: fast session browsing, accurate project grouping, useful time filtering, and workable per-session inspection.

## Long-term Vision

Turn this into a durable local observability layer for agent work: a tool that makes it easy to understand what was done, when it happened, where it happened, and how activity changed over time.

## Related Projects

- `~/gitrepos/x-forks/euphony` - upstream foundation and comparison point.
- `~/gitrepos/14_apps-and-utilities/qmd-service` - related local search tooling and query patterns.
- `~/gitrepos/_REPOLOG` - machine-local repo registry and sibling-project context.

## Global Conventions

See `~/AGENTS.md` for toolchain defaults on this machine. This repo follows the existing project toolchain: `pnpm` for frontend work and `uv` for the Python backend environment.

## Project-Specific Conventions

- `AGENTS.md` is the canonical instruction file for this repo. Keep `CLAUDE.md` as a loader only.
- Keep the product local-first. New features should assume localhost use and local session files as the primary source.
- Prefer cached metadata in SQLite over repeated raw-history rescans when adding new browse or analytics features.
- Do not modify files under `lib/` unless the change explicitly requires rebuilding generated output.
- Preserve the main user flows: browse sessions, browse projects, open a session, filter by time/project/folder, and search session content locally.
- Legacy or metadata-poor sessions must degrade gracefully. Hide or soften missing context rather than showing noisy placeholders.

## Data and Privacy

- Treat local Codex history as sensitive. Session content may include prompts, tool outputs, file paths, repo names, and private working context.
- Do not add telemetry or remote analytics by default.
- Any feature that exposes local session content outside localhost needs explicit review before it is committed.

## Validation

- Frontend validation: `pnpm run build`
- Backend validation: `python3 -m py_compile server/fastapi-main.py`
- When metadata extraction changes, also verify the session list, project list, and time-filter views against real local data.

## Changelog

- Use `changelog/changes/` for shipped browser, backend, or cache behavior.
- Use `changelog/decisions/` for durable choices such as naming, cache strategy, privacy boundaries, or URL model changes.
- Use `changelog/backlog/` for deferred browser, analytics, or search work.

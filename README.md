# Codex Spelunker

Codex Spelunker is a local Codex history browser built on [OpenAI Euphony](https://github.com/openai/euphony).

It is for browsing, searching, and analyzing Codex session history on your own machine. The upstream Euphony viewer is still the foundation, but this repo now behaves like a local-first session browser rather than a generic public JSON viewer.

## Tagline

Browse local Codex sessions, projects, and timelines, built on Euphony.

## Why This Exists

The original Euphony app is useful for rendering structured conversation logs, but it is not designed as a day-to-day browser for a personal Codex history store. Codex Spelunker shifts the center of gravity toward local use:

- your default `~/.codex` store
- merged historical and current session formats
- project and timeline browsing
- local analytics and time filtering
- local search over Codex session content

The point is to make it practical to answer questions like:

- What was I working on yesterday?
- Which projects had the most agent activity last week?
- Which session contains a prompt or workflow I want to reuse?
- How did activity or token usage change over time?

## What It Does

- browses local Codex history from the default `~/.codex` store
- merges archived, legacy, and newer recursive session logs into one browser
- groups sessions into projects inferred from local session metadata
- filters sessions by project, folder, and time range
- shows usage/activity statistics over time
- opens full sessions from the session list with a local backend
- adds semantic and keyword search over Codex session content using local `qmd`

## How It Was Created

This repository started as a clone/copy of the upstream `openai/euphony` codebase and was then adapted for local use.

The main changes from upstream are:

- a FastAPI backend that can read local Codex history
- a local session index and project browser
- session metadata caching in SQLite for faster browsing
- time-based filtering and usage analytics
- local `qmd` integration for semantic and keyword search over session content
- a homepage and navigation flow centered on local sessions rather than public JSON URLs

Upstream license and notice files are preserved.

## Repository Layout

- `src/` - frontend app and local session browser UI
- `server/` - FastAPI backend for local session access, metadata extraction, and qmd integration
- `public/` - static app assets
- `tests/` - test fixtures and validation assets
- `AGENTS.md` - canonical repo instructions for agents
- `CLAUDE.md` - loader pointing Claude Code at `AGENTS.md`
- `changelog/` - repo-local narrative history for durable changes, decisions, and backlog

## Repo Conventions

- `AGENTS.md` is the source of truth for repo-specific instructions. Update it when operating conventions change.
- `CLAUDE.md` should remain a loader only.
- Keep the product local-first and privacy-aware. Features should assume localhost unless explicitly designed otherwise.
- Prefer metadata caching over repeated raw session rescans when adding browser or analytics features.
- Do not edit `lib/` directly unless the change requires rebuilding generated output.
- Use `changelog/changes/` for shipped behavior, `changelog/decisions/` for durable policy or architecture choices, and `changelog/backlog/` for deferred work.

## Local Codex Support

By default the backend reads from:

```text
~/.codex
```

It supports:

- `archived_sessions/*.jsonl`
- `sessions/*.json`
- `sessions/**/*.jsonl`
- `session_index.jsonl`

## qmd Integration

Codex Spelunker calls the local `qmd` CLI directly from the backend. It does not require a separate qmd HTTP service.

Default path:

```text
/opt/homebrew/bin/qmd
```

Override with:

```bash
export QMD_BIN=/custom/path/to/qmd
```

## Cache and Metadata

Session and project browsing are backed by a local SQLite metadata cache so the app does not need to recompute everything from raw history on every page load. The cache is refreshed from the local Codex store and supports project grouping, time filtering, and usage summaries.

## Development

Install frontend dependencies:

```bash
pnpm install
```

Create a Python environment and install backend dependencies:

```bash
uv venv .venv
source .venv/bin/activate
uv pip install -e .
```

Run the backend:

```bash
pnpm run dev:backend
```

Run the frontend:

```bash
pnpm run dev
```

Open:

[http://127.0.0.1:3000/](http://127.0.0.1:3000/)

Useful validation commands:

```bash
pnpm run build
python3 -m py_compile server/fastapi-main.py
```

## Safety Notes

- This project is intended for local use.
- Review backend endpoints before exposing it outside localhost.
- Session content may include prompts, tool outputs, file paths, and other local machine context.

## Upstream

Codex Spelunker is built on [OpenAI Euphony](https://github.com/openai/euphony).

# Codex Spelunker

Codex Spelunker is a local Codex history browser built on [OpenAI Euphony](https://github.com/openai/euphony).

It is for browsing, searching, and analyzing Codex session history on your own machine. The upstream Euphony viewer is still the foundation, but this fork shifts the product from a generic JSON viewer to a local-first browser for agent sessions, projects, timelines, and usage patterns.

## Tagline

Browse local Codex sessions, projects, and timelines, built on Euphony.

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

## Safety Notes

- This project is intended for local use.
- Review backend endpoints before exposing it outside localhost.
- Session content may include prompts, tool outputs, file paths, and other local machine context.

## Upstream

Codex Spelunker is built on [OpenAI Euphony](https://github.com/openai/euphony).

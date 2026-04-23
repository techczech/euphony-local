# Euphony Local

`euphony-local` is a local-first fork of [OpenAI Euphony](https://github.com/openai/euphony) for browsing Codex session history on your own machine.

It keeps the original Harmony and Codex rendering capabilities, but changes the product focus from "open a public JSON or JSONL URL" to "browse local agent history, projects, and sessions directly from a local Codex store."

## What It Does

- browses local Codex history from the default `~/.codex` store
- merges archived, legacy, and newer recursive session logs into one browser
- groups sessions into projects inferred from local session metadata
- opens full sessions from the session list with a local backend
- supports live filtering by session title, first prompt, project, and folder
- adds semantic and keyword search over Codex session content using local `qmd`

## How It Was Created

This repository started as a clone/copy of the upstream `openai/euphony` codebase and was then adapted for local use.

The main changes from upstream are:

- a FastAPI backend that can read local Codex history
- a local session index and project browser
- session metadata caching in SQLite for faster browsing
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

`euphony-local` calls the local `qmd` CLI directly from the backend. It does not require a separate qmd HTTP service.

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

Based on [OpenAI Euphony](https://github.com/openai/euphony).

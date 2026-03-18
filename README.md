# workato-dev-api

Zero-dependency CLI and SDK for the [Workato Developer API](https://docs.workato.com/workato-api.html). Built for use with AI coding assistants and programmatic tooling — read and write recipes, connections, data tables, projects, folders, and jobs.

---

## Claude Code

This package ships a Claude Code skill (`/workato`) that gives Claude full Workato context: recipe structure, wiring syntax, data table column naming, and every CLI command.

### Install the skill

**Project-level** (checked in to your repo, available to anyone who clones it):

```sh
npx workato-dev-api auth YOUR_API_TOKEN
npx workato-dev-api bootstrap
```

This writes `.claude/commands/workato.md` in your current directory. Commit it alongside your code.

**User-level** (available in every project on your machine):

```sh
npx workato-dev-api auth YOUR_API_TOKEN --user
npx workato-dev-api bootstrap --user
```

This writes `~/.env` and `~/.claude/commands/workato.md`.

### Using the skill

Once installed, Claude can invoke the skill autonomously whenever it needs Workato context. You can also call it explicitly:

```
/workato
```

> **Workato free sandbox?** Just tell Claude — it will update your `package.json` automatically so the CLI points at the right URL.

---

## Other AI assistants (Cursor, Windsurf, ...)

Run `workato bootstrap` and copy the generated `.claude/commands/workato.md` to wherever your assistant reads project context (e.g. `.cursorrules`, `.windsurfrules`). The content is plain markdown.

---

## SDK / CLI Reference

### Install

```sh
npm install -g workato-dev-api
```

Or use without installing:

```sh
npx workato-dev-api <command>
```

### Authentication

Set `WORKATO_API_TOKEN` in a `.env` file, or run:

```sh
workato auth YOUR_API_TOKEN           # writes to cwd/.env
workato auth YOUR_API_TOKEN --user    # writes to ~/.env
```

The CLI checks `.env` files in this order, with later files winning:

1. `<package-dir>/.env`
2. `~/.env`
3. `./.env` (cwd) — highest priority

### Sandbox configuration

By default the CLI targets `app.workato.com`. For a Workato free sandbox (trial account), set in your `package.json`:

```json
{
  "workato": { "sandbox": true }
}
```

This switches the base URL to `app.trial.workato.com`.

### Commands

#### Setup

| Command | Description |
|---|---|
| `workato auth <token> [--user]` | Save API token to `.env` (default: cwd; `--user`: home dir) |
| `workato bootstrap [--user]` | Install the `/workato` Claude Code skill (project-level by default, `--user` for user-level) |

#### Read

| Command | Description |
|---|---|
| `workato get <recipe_id>` | Fetch recipe code JSON → saved to `recipe_<id>_code.json` |
| `workato list-recipes` | List recipes. Filters: `--folder <id>`, `--project <id>`, `--page <n>` |
| `workato list-projects` | List all projects |
| `workato list-folders` | List folders. Filter: `--parent <id>` |
| `workato list-connections` | List connections. Filter: `--folder <id>` |
| `workato list-data-tables` | List data tables. Filter: `--project <id>` |
| `workato get-data-table <id>` | Fetch data table schema and details |
| `workato get-jobs <recipe_id>` | List recent jobs. Filters: `--limit <n>`, `--status <status>` |
| `workato get-job <recipe_id> <job_id>` | Fetch a single job |

#### Write

| Command | Description |
|---|---|
| `workato create "<name>" <code.json>` | Create a recipe from a full code JSON file |
| `workato create-api-trigger "<name>"` | Create a recipe with a bare API Platform trigger |
| `workato update-step <recipe_id> <step_as_id> <patch.json>` | Deep-merge a patch into one step (by `as` ID) |
| `workato put-code <recipe_id> <code.json>` | Replace an entire recipe's code |
| `workato start <recipe_id>` | Start a recipe |
| `workato stop <recipe_id>` | Stop a recipe |
| `workato delete <recipe_id>` | Delete a recipe |

### Recipe code structure

A recipe's code is a JSON object. The top-level object is the **trigger** step; action steps live in `code.block[]`. Each step has a unique `as` field (8-char hex) used for cross-step wiring (datapills).

`workato get <id>` saves the code to `recipe_<id>_code.json` for inspection and editing before pushing back with `put-code`.

### Development

```sh
git clone https://github.com/bill-bishop/workato-dev-api
cd workato-dev-api
cp .env.example .env   # add your token
npm test               # 115 unit tests, no network required
```

Tests use Node's built-in `node:test` runner — no extra dependencies.

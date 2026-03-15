# workato-dev-api

A zero-dependency CLI for the [Workato Developer API](https://docs.workato.com/workato-api.html). Read and edit recipes, connections, data tables, projects, folders, and jobs from your terminal.

## Install

```sh
npm install -g workato-dev-api
```

Or use without installing:

```sh
npx workato-dev-api <command>
```

## Authentication

Set `WORKATO_API_TOKEN` in a `.env` file. The CLI checks these locations in order, with **later files winning**:

1. `<package-dir>/.env` — lowest priority (rarely used)
2. `~/.env` — your home directory default
3. `./.env` (cwd) — **highest priority**, project-specific override

```sh
# .env
WORKATO_API_TOKEN=your_token_here
```

You can also export it directly in your shell environment.

## Claude Code setup

In a clean working directory, run these two commands once before starting Claude Code:

```sh
npx workato-dev-api auth YOUR_API_TOKEN
npx workato-dev-api bootstrap-claude
```

That's it. The first command saves your token to `.env`. The second drops a `CLAUDE.md` into the directory so Claude Code automatically has full context — recipe structure, wiring syntax, data table column names, and project reference IDs.

Then open Claude Code in that directory and start working. If you're on a **Workato free sandbox**, just tell Claude — it will update your `package.json` automatically so the CLI points at the right URL.

## Commands

### Setup

| Command | Description |
|---|---|
| `workato bootstrap-claude` | Copy `CLAUDE.md` into the current directory |
| `workato auth <token>` | Save your API token to `.env` in the current directory |

### Read

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

### Write

| Command | Description |
|---|---|
| `workato create "<name>" <code.json>` | Create a recipe from a full code JSON file |
| `workato create-api-trigger "<name>"` | Create a recipe with a bare API Platform trigger |
| `workato update-step <recipe_id> <step_as_id> <patch.json>` | Deep-merge a patch into one step (by `as` ID) |
| `workato put-code <recipe_id> <code.json>` | Replace an entire recipe's code |
| `workato start <recipe_id>` | Start a recipe |
| `workato stop <recipe_id>` | Stop a recipe |
| `workato delete <recipe_id>` | Delete a recipe |

## Examples

```sh
# Fetch recipe code and save to file
workato get 167603

# List all recipes in a project
workato list-recipes --project 14318

# List jobs that failed
workato get-jobs 167603 --limit 20 --status failed

# Start a recipe
workato start 167603

# Patch a single step's input fields
cat > patch.json <<'EOF'
{
  "input": {
    "language": "fr"
  }
}
EOF
workato update-step 167603 5df21cfd patch.json

# Replace entire recipe code
workato put-code 167603 recipe_167603_code.json
```

## Recipe code structure

A recipe's code is a JSON object. The top-level object is the **trigger** step; action steps live in `code.block[]`. Each step has a unique `as` field (8-char hex) used for cross-step wiring (datapills).

`workato get <id>` saves the code to `recipe_<id>_code.json` so you can inspect and edit it before pushing back with `put-code`.

## Development

```sh
git clone ...
cd workato-dev-api
cp .env.example .env   # add your token
npm test               # runs 88 unit tests, no network required
```

Tests use Node's built-in `node:test` runner — no extra dependencies.

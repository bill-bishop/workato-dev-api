---
description: Workato Dev API — CLI reference, recipe code structure, and field wiring syntax for building/patching Workato recipes
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# Workato Dev Environment — Claude Notes

## CLI: `workato-dev-api`

Use `npx workato-dev-api <command>` (or `workato <command>` if installed globally) for all Workato operations — reads and writes alike.

Requires `WORKATO_API_TOKEN` in a `.env` file (cwd `.env` takes highest priority).

Base URL is determined by `workato.sandbox` in the project's `package.json`:
- `false` (default): `https://app.workato.com/api`
- `true` (free sandbox): `https://app.trial.workato.com/api`

**If the user says they are on a Workato free sandbox or trial account, set `"sandbox": true` in the `workato` block of their `package.json` immediately.**

### Commands

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
| `workato create "<name>" <code.json>` | Create a recipe from a code JSON file. File may be a bare code object **or** a `{ "code": {...}, "config": [...] }` wrapper (use the wrapper to set connections at creation time). |
| `workato create-api-trigger "<name>"` | Create a recipe with a bare API Platform trigger |
| `workato update-step <recipe_id> <step_as_id> <patch.json>` | Deep-merge a patch into one step (by `as` ID) |
| `workato put-code <recipe_id> <code.json>` | Replace entire recipe code |
| `workato start <recipe_id>` | Start a recipe |
| `workato stop <recipe_id>` | Stop a recipe |
| `workato delete <recipe_id>` | Delete a recipe |

### How `update-step` works
- Fetches current recipe code
- Finds the step whose `as` field matches `<step_as_id>` (searches recursively into nested `block` arrays; trigger is the top-level code object)
- Deep-merges the patch JSON into that step (objects merged, arrays/primitives replaced)
- PUTs the full updated code back

---

## Recipe Code Structure

A recipe's `code` field is a JSON-stringified object. The top-level object is the **trigger** step; action steps live in `code.block[]`.

```json
{
  "number": 0,
  "provider": "<provider>",
  "name": "<action_name>",
  "as": "<8-char-hex>",           // unique step ID used for wiring
  "keyword": "trigger",            // "trigger" | "action" | "if" | "foreach" etc.
  "dynamicPickListSelection": {},
  "toggleCfg": {},
  "input": { ... },               // field values and wiring go here
  "extended_output_schema": [...], // THIS is the output schema — must be specified manually
  "extended_input_schema": [...],  // describes available input fields (e.g. data table columns) — must be specified manually
  "block": [...],                  // nested steps
  "uuid": "<uuid>",
  "title": null,
  "description": null
}
```

There is no non-extended `output_schema` / `input_schema` — `extended_output_schema` and `extended_input_schema` are the only schema fields. For some built-in connector actions (e.g. OpenAI `transcription`), the output schema is known server-side and the step can omit `extended_output_schema` entirely — downstream steps can still wire from it using the datapill syntax. For custom/dynamic steps (e.g. API Platform trigger, Data Table), you must provide these schemas explicitly.

The recipe also has a separate `config` array (JSON-stringified) listing which connections are used:
```json
[
  { "keyword": "application", "name": "<provider>", "provider": "<provider>", "skip_validation": false, "account_id": <connection_id_or_null> }
]
```

---

## Field Wiring Syntax

All field values in a step's `input` object use one of three forms:

### 1. Datapill — reference another step's output

```
"#{_dp('{\"pill_type\":\"output\",\"provider\":\"<provider>\",\"line\":\"<step_as_id>\",\"path\":[\"<field1>\",\"<field2>\"]}')}
```

- `provider`: the provider of the source step (e.g. `workato_api_platform`, `open_ai`, `workato_db_table`, `google_drive`)
- `line`: the `as` value (8-char hex) of the source step
- `path`: JSON array of strings navigating the output schema

**Example — wire a trigger field into a downstream step:**
```json
"file_content": "#{_dp('{\"pill_type\":\"output\",\"provider\":\"workato_api_platform\",\"line\":\"<trigger_as_id>\",\"path\":[\"request\",\"file_content\"]}')}
```

**Example — wire a step's output into a data table column:**
```json
"<column_uuid>": "#{_dp('{\"pill_type\":\"output\",\"provider\":\"open_ai\",\"line\":\"<step_as_id>\",\"path\":[\"text\"]}')}
```

### 2. Formula mode — Workato functions/expressions

Prefix the value with `=` inside the string:

```
"=\"#{now}\""       // current timestamp
"=\"#{uuid}\""      // generate a UUID
```

### 3. Static literal

Plain string value — no special syntax:
```json
"language": "en",
"table_id": "123"
```

---

## Data Table Column Names

Data table column field names in `input.parameters` are **UUID-style strings with underscores**, not human-readable names. Always use `workato get-data-table <id>` or read the existing recipe code to look up the correct column UUIDs before wiring — never guess them.

---

## Reference Recipes

If you are unsure how to wire a particular connector or step type, ask the user:
> "Do you have an existing recipe that uses [connector/trigger type]? If so, share the recipe ID and I'll fetch it as a wiring reference."

Use `workato get <recipe_id>` to inspect the code and extract the correct `as` IDs, `provider` values, `input` structure, and `extended_output_schema` before building or patching a new recipe.

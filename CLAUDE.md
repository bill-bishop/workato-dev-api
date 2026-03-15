# Workato Dev Environment — Claude Notes

## CLI: `workato-dev-api`

Use `npx workato-dev-api <command>` (or `workato <command>` if installed globally) for all Workato operations — reads and writes alike.

Requires `WORKATO_API_TOKEN` in a `.env` file (cwd `.env` takes highest priority). Base URL: `https://app.trial.workato.com/api`.

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
| `workato create "<name>" <code.json>` | Create a recipe from a full code JSON file |
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

**Example — wire trigger's `request.file_content` into an OpenAI step:**
```json
"file_content": "#{_dp('{\"pill_type\":\"output\",\"provider\":\"workato_api_platform\",\"line\":\"8f52532b\",\"path\":[\"request\",\"file_content\"]}')}
```

**Example — wire OpenAI step's `text` output into a data table column:**
```json
"03886fe9_176d_4bdd_9296_d48219b345c8": "#{_dp('{\"pill_type\":\"output\",\"provider\":\"open_ai\",\"line\":\"5df21cfd\",\"path\":[\"text\"]}')}
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
"table_id": "3512"
```

---

## Data Table Column Names

Data table column field names in `input.parameters` are **UUID-style strings with underscores**, not human-readable names. You must fetch the recipe's existing code (or the data table schema) to get the correct column key for each field.

Example from Audio Transcripts table:
- `transcript_text` → `03886fe9_176d_4bdd_9296_d48219b345c8`
- `transcribed_at`  → `aa4e76dd_0de1_4f0a_946b_fb0a4e1ecff5`
- `file_name`       → `33ee499b_51cc_4ddf_ba03_6a5b8eca79f5`
- `file_id`         → `0f05f324_040d_4d11_b201_05afaa850729`
- `recorded_at`     → `aefc6da4_93a5_40e9_b933_13c2cac095ac`

Always use `workato get-data-table <id>` or read the recipe code to look up the actual column UUIDs before wiring.

---

## Reference Recipe

**Transcribe Audio** (ID: 167603) — `https://app.trial.workato.com/recipes/167603-transcribe-audio`

This recipe demonstrates complete working wiring across all three step types (API Platform trigger → OpenAI action → Data Table action). Use it as the canonical wiring reference.

Trigger `as`: `8f52532b` | OpenAI step `as`: `5df21cfd` | Data Table step `as`: `1614a36d`

---

## Current Project

**"Get Audio Transcript"** — Project ID: `14318`, Folder ID: `20245`

Key recipe IDs:
- `167582` — Get Audio Transcript (callable, RecipeOps trigger)
- `167583` — Audio File Orchestrator (Google Drive trigger)
- `167603` — Transcribe Audio (API Platform trigger, reference recipe)

Key connection IDs:
- OpenAI: `14358`
- RecipeOps: `14233`

Data Table: **Audio Transcripts** (ID: `3512`) in project `14318`.

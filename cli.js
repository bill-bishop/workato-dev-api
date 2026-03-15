#!/usr/bin/env node
'use strict';

const os = require('os');
const path = require('path');
const {
  loadEnv, setConfig, resolveBaseUrl, readProjectConfig,
  cmdBootstrap, cmdAuth,
  cmdGet, cmdListRecipes, cmdListProjects, cmdListFolders,
  cmdListConnections, cmdListDataTables, cmdGetDataTable,
  cmdGetJobs, cmdGetJob,
  cmdCreate, cmdCreateApiTrigger, cmdUpdateStep, cmdPutCode,
  cmdStart, cmdStop, cmdDelete,
} = require('./lib');

// Setup commands run before env/token setup
const _setupCmd = process.argv[2];
if (_setupCmd === 'bootstrap') {
  cmdBootstrap(process.cwd());
  process.exit(0);
}
if (_setupCmd === 'auth') {
  const token = process.argv[3];
  if (!token) {
    console.error('Usage: workato auth <token>');
    process.exit(1);
  }
  cmdAuth(token, process.cwd());
  process.exit(0);
}

// Load order — last one wins, so highest-priority sources go last:
//   package dir  →  home dir  →  cwd  (cwd always wins)
loadEnv(path.join(__dirname, '.env'));
loadEnv(path.join(os.homedir(), '.env'));
loadEnv(path.join(process.cwd(), '.env'));

if (!process.env.WORKATO_API_TOKEN) {
  console.error('Error: WORKATO_API_TOKEN not set.\nRun: workato auth <your_token>\nOr create a .env file with: WORKATO_API_TOKEN=your_token_here');
  process.exit(1);
}

// Apply base URL from workato.sandbox in cwd package.json
const { workato: _wCfg = {} } = readProjectConfig();
setConfig({ baseUrl: resolveBaseUrl(_wCfg.sandbox) });

// Parse argv: separate --flag value pairs from positional args
function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      // treat next token as value unless it's also a flag or missing
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(argv[i]);
    }
  }
  return { positional, flags };
}

function usage() {
  console.error(`
workato <command> [options]

Setup:
  bootstrap                                  Copy CLAUDE.md into the current directory
  auth <token>                               Save API token to .env in the current directory

Read commands:
  get <recipe_id>                            Fetch recipe code → recipe_<id>_code.json
  list-recipes [--folder <id>] [--project <id>] [--page <n>]
  list-projects
  list-folders [--parent <id>]
  list-connections [--folder <id>]
  list-data-tables [--project <id>]
  get-data-table <id>                        Fetch data table schema/details
  get-jobs <recipe_id> [--limit <n>] [--status <status>]
  get-job <recipe_id> <job_id>

Write commands:
  create "<name>" <code.json>                Create recipe from full code JSON
  create-api-trigger "<name>"               Create recipe with a bare API Platform trigger
  update-step <recipe_id> <step_as_id> <patch.json>  Deep-merge patch into a step
  put-code <recipe_id> <code.json>           Replace entire recipe code
  start <recipe_id>                          Start a recipe
  stop <recipe_id>                           Stop a recipe
  delete <recipe_id>                         Delete a recipe

Environment:
  WORKATO_API_TOKEN   Required. Set in a .env file in your current directory.
`.trim());
  process.exit(1);
}

const [,, cmd, ...rawArgs] = process.argv;
const { positional: args, flags } = parseArgs(rawArgs);

(async () => {
  try {
    switch (cmd) {
      // ── Read ──────────────────────────────────────────────────────────────
      case 'get':
        if (!args[0]) usage();
        await cmdGet(args[0]);
        break;

      case 'list-recipes':
        await cmdListRecipes({
          folder_id: flags.folder,
          project_id: flags.project,
          page: flags.page,
        });
        break;

      case 'list-projects':
        await cmdListProjects();
        break;

      case 'list-folders':
        await cmdListFolders({ parent_id: flags.parent });
        break;

      case 'list-connections':
        await cmdListConnections({ folder_id: flags.folder });
        break;

      case 'list-data-tables':
        await cmdListDataTables({ project_id: flags.project });
        break;

      case 'get-data-table':
        if (!args[0]) usage();
        await cmdGetDataTable(args[0]);
        break;

      case 'get-jobs':
        if (!args[0]) usage();
        await cmdGetJobs(args[0], { limit: flags.limit, status: flags.status });
        break;

      case 'get-job':
        if (!args[0] || !args[1]) usage();
        await cmdGetJob(args[0], args[1]);
        break;

      // ── Write ─────────────────────────────────────────────────────────────
      case 'create':
        if (!args[0] || !args[1]) usage();
        await cmdCreate(args[0], args[1]);
        break;

      case 'create-api-trigger':
        await cmdCreateApiTrigger(args[0] || 'New API Recipe');
        break;

      case 'update-step':
        if (!args[0] || !args[1] || !args[2]) usage();
        await cmdUpdateStep(args[0], args[1], args[2]);
        break;

      case 'put-code':
        if (!args[0] || !args[1]) usage();
        await cmdPutCode(args[0], args[1]);
        break;

      case 'start':
        if (!args[0]) usage();
        await cmdStart(args[0]);
        break;

      case 'stop':
        if (!args[0]) usage();
        await cmdStop(args[0]);
        break;

      case 'delete':
        if (!args[0]) usage();
        await cmdDelete(args[0]);
        break;

      default:
        usage();
    }
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
})();

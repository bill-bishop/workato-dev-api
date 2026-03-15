'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ── Config ────────────────────────────────────────────────────────────────────

const _config = {
  baseUrl: 'https://app.trial.workato.com/api',
  token: null,
};

function loadEnv(envPath) {
  const p = envPath ?? path.join(process.cwd(), '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

function setConfig(cfg) {
  Object.assign(_config, cfg);
}

function getToken() {
  return _config.token || process.env.WORKATO_API_TOKEN;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function apiGet(urlPath) {
  const res = await fetch(`${_config.baseUrl}${urlPath}`, {
    headers: { 'Authorization': `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`GET ${urlPath} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiPost(urlPath, body) {
  const res = await fetch(`${_config.baseUrl}${urlPath}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST ${urlPath} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiPut(urlPath, body) {
  const res = await fetch(`${_config.baseUrl}${urlPath}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${urlPath} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function apiDelete(urlPath) {
  const res = await fetch(`${_config.baseUrl}${urlPath}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(`DELETE ${urlPath} failed: ${res.status} ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : {};
}

// ── Recipe code helpers ───────────────────────────────────────────────────────

// Recursively find a step by its `as` value within block arrays
function findStep(block, asId) {
  for (const step of block) {
    if (step.as === asId) return step;
    if (step.block) {
      const found = findStep(step.block, asId);
      if (found) return found;
    }
  }
  return null;
}

// Deep merge source into target (mutates target). Arrays/primitives are replaced, objects are merged.
function deepMerge(target, source) {
  for (const [key, val] of Object.entries(source)) {
    if (
      val && typeof val === 'object' && !Array.isArray(val) &&
      target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])
    ) {
      deepMerge(target[key], val);
    } else {
      target[key] = val;
    }
  }
}

function extractCode(data) {
  const recipe = data.recipe ?? data;
  return JSON.parse(recipe.code);
}

function randomHex(n) {
  return crypto.randomBytes(n).toString('hex').slice(0, n);
}

function randomUUID() {
  return crypto.randomUUID();
}

function apiTriggerCode() {
  return {
    number: 0,
    provider: 'workato_api_platform',
    name: 'receive_request',
    as: randomHex(8),
    title: null,
    description: null,
    keyword: 'trigger',
    dynamicPickListSelection: {},
    toggleCfg: {},
    input: {
      request: { content_type: 'json', schema: '[]' },
      response: { content_type: 'json', responses: [] },
    },
    extended_output_schema: [],
    extended_input_schema: [],
    block: [],
    uuid: randomUUID(),
  };
}

function apiTriggerConfig() {
  return [
    { keyword: 'application', name: 'workato_api_platform', provider: 'workato_api_platform', skip_validation: false, account_id: null },
  ];
}

// ── Read commands ─────────────────────────────────────────────────────────────

async function cmdGet(recipeId) {
  const data = await apiGet(`/recipes/${recipeId}`);
  const code = extractCode(data);
  const outFile = `recipe_${recipeId}_code.json`;
  fs.writeFileSync(outFile, JSON.stringify(code, null, 2));
  console.log(JSON.stringify(code, null, 2));
  console.error(`\nSaved to ${outFile}`);
  return code;
}

async function cmdListRecipes(opts = {}) {
  const params = new URLSearchParams();
  if (opts.folder_id) params.set('folder_id', opts.folder_id);
  if (opts.project_id) params.set('project_id', opts.project_id);
  if (opts.page) params.set('page', opts.page);
  if (opts.per_page) params.set('per_page', opts.per_page);
  const qs = params.toString();
  const data = await apiGet(`/recipes${qs ? '?' + qs : ''}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function cmdListProjects() {
  const data = await apiGet('/projects');
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function cmdListFolders(opts = {}) {
  const params = new URLSearchParams();
  if (opts.parent_id) params.set('parent_id', opts.parent_id);
  const qs = params.toString();
  const data = await apiGet(`/folders${qs ? '?' + qs : ''}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function cmdListConnections(opts = {}) {
  const params = new URLSearchParams();
  if (opts.folder_id) params.set('folder_id', opts.folder_id);
  const qs = params.toString();
  const data = await apiGet(`/connections${qs ? '?' + qs : ''}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function cmdListDataTables(opts = {}) {
  const params = new URLSearchParams();
  if (opts.project_id) params.set('project_id', opts.project_id);
  const qs = params.toString();
  const data = await apiGet(`/data_tables${qs ? '?' + qs : ''}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function cmdGetDataTable(id) {
  const data = await apiGet(`/data_tables/${id}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function cmdGetJobs(recipeId, opts = {}) {
  const params = new URLSearchParams();
  if (opts.limit) params.set('per_page', opts.limit);
  if (opts.status) params.set('status', opts.status);
  const qs = params.toString();
  const data = await apiGet(`/recipes/${recipeId}/jobs${qs ? '?' + qs : ''}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

async function cmdGetJob(recipeId, jobId) {
  const data = await apiGet(`/recipes/${recipeId}/jobs/${jobId}`);
  console.log(JSON.stringify(data, null, 2));
  return data;
}

// ── Write commands ────────────────────────────────────────────────────────────

async function cmdCreate(name, codeFile) {
  const code = JSON.parse(fs.readFileSync(codeFile, 'utf8'));
  const result = await apiPost('/recipes', {
    recipe: { name, code: JSON.stringify(code) },
  });
  console.log(JSON.stringify(result, null, 2));
  const id = (result.recipe ?? result).id;
  console.error(`\nCreated recipe id: ${id}`);
  return result;
}

async function cmdCreateApiTrigger(name) {
  const code = apiTriggerCode();
  const config = apiTriggerConfig();
  const result = await apiPost('/recipes', {
    recipe: { name, code: JSON.stringify(code), config: JSON.stringify(config) },
  });
  console.log(JSON.stringify(result, null, 2));
  const id = (result.recipe ?? result).id;
  console.error(`\nCreated recipe id: ${id}`);
  return result;
}

async function cmdUpdateStep(recipeId, asId, patchFile) {
  const patch = JSON.parse(fs.readFileSync(patchFile, 'utf8'));

  const data = await apiGet(`/recipes/${recipeId}`);
  const code = extractCode(data);

  let step;
  if (code.as === asId) {
    step = code;
  } else {
    step = findStep(code.block ?? [], asId);
  }
  if (!step) throw new Error(`Step with as="${asId}" not found`);

  console.error(`Found step: ${step.keyword} (as: ${asId})`);
  deepMerge(step, patch);

  const result = await apiPut(`/recipes/${recipeId}`, {
    recipe: { code: JSON.stringify(code) },
  });
  console.log(JSON.stringify(result, null, 2));
  console.error(`\nStep ${asId} updated successfully.`);
  return result;
}

async function cmdPutCode(recipeId, codeFile) {
  const code = JSON.parse(fs.readFileSync(codeFile, 'utf8'));
  const result = await apiPut(`/recipes/${recipeId}`, {
    recipe: { code: JSON.stringify(code) },
  });
  console.log(JSON.stringify(result, null, 2));
  console.error('\nRecipe code replaced successfully.');
  return result;
}

async function cmdStart(recipeId) {
  const result = await apiPut(`/recipes/${recipeId}/start`, {});
  console.log(JSON.stringify(result, null, 2));
  console.error(`\nRecipe ${recipeId} started.`);
  return result;
}

async function cmdStop(recipeId) {
  const result = await apiPut(`/recipes/${recipeId}/stop`, {});
  console.log(JSON.stringify(result, null, 2));
  console.error(`\nRecipe ${recipeId} stopped.`);
  return result;
}

async function cmdDelete(recipeId) {
  const result = await apiDelete(`/recipes/${recipeId}`);
  console.log(JSON.stringify(result, null, 2));
  console.error(`\nRecipe ${recipeId} deleted.`);
  return result;
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  // config
  loadEnv, setConfig, getToken,
  // http
  apiGet, apiPost, apiPut, apiDelete,
  // helpers
  findStep, deepMerge, extractCode,
  apiTriggerCode, apiTriggerConfig,
  // read commands
  cmdGet, cmdListRecipes, cmdListProjects, cmdListFolders,
  cmdListConnections, cmdListDataTables, cmdGetDataTable,
  cmdGetJobs, cmdGetJob,
  // write commands
  cmdCreate, cmdCreateApiTrigger, cmdUpdateStep, cmdPutCode,
  cmdStart, cmdStop, cmdDelete,
};

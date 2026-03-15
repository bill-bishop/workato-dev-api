'use strict';

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Set token before requiring lib so the module loads cleanly
process.env.WORKATO_API_TOKEN = 'test-token';

const lib = require('../lib');

// Reset config before each test to avoid cross-test bleed
beforeEach(() => {
  lib.setConfig({ baseUrl: 'https://example.com/api', token: 'tok' });
});

// Silence console output during tests
const origLog = console.log;
const origError = console.error;
beforeEach(() => {
  console.log = () => {};
  console.error = () => {};
});
// Restore after each suite naturally via test isolation — tests clean up their own mocks

// ── findStep ─────────────────────────────────────────────────────────────────

describe('findStep', () => {
  test('finds step at top level of block', () => {
    const block = [
      { as: 'aaa', keyword: 'action' },
      { as: 'bbb', keyword: 'action' },
    ];
    assert.deepEqual(lib.findStep(block, 'bbb'), { as: 'bbb', keyword: 'action' });
  });

  test('finds step nested inside a block', () => {
    const block = [
      {
        as: 'aaa', keyword: 'if', block: [
          { as: 'ccc', keyword: 'action' },
        ],
      },
    ];
    assert.deepEqual(lib.findStep(block, 'ccc'), { as: 'ccc', keyword: 'action' });
  });

  test('finds deeply nested step', () => {
    const block = [
      {
        as: 'a1', keyword: 'foreach', block: [
          {
            as: 'a2', keyword: 'if', block: [
              { as: 'a3', keyword: 'action' },
            ],
          },
        ],
      },
    ];
    assert.deepEqual(lib.findStep(block, 'a3'), { as: 'a3', keyword: 'action' });
  });

  test('returns null when step not found', () => {
    const block = [{ as: 'aaa', keyword: 'action' }];
    assert.equal(lib.findStep(block, 'zzz'), null);
  });

  test('returns null on empty block', () => {
    assert.equal(lib.findStep([], 'aaa'), null);
  });
});

// ── deepMerge ─────────────────────────────────────────────────────────────────

describe('deepMerge', () => {
  test('merges flat objects', () => {
    const target = { a: 1, b: 2 };
    lib.deepMerge(target, { b: 3, c: 4 });
    assert.deepEqual(target, { a: 1, b: 3, c: 4 });
  });

  test('deep merges nested objects', () => {
    const target = { input: { lang: 'en', size: 10 } };
    lib.deepMerge(target, { input: { size: 20 } });
    assert.deepEqual(target, { input: { lang: 'en', size: 20 } });
  });

  test('replaces arrays entirely (does not merge elements)', () => {
    const target = { block: [1, 2, 3] };
    lib.deepMerge(target, { block: [4, 5] });
    assert.deepEqual(target, { block: [4, 5] });
  });

  test('adds new top-level keys', () => {
    const target = { a: 1 };
    lib.deepMerge(target, { b: { c: 3 } });
    assert.deepEqual(target, { a: 1, b: { c: 3 } });
  });

  test('overwrites primitive with a new value', () => {
    const target = { lang: 'en' };
    lib.deepMerge(target, { lang: 'fr' });
    assert.deepEqual(target, { lang: 'fr' });
  });

  test('merges multiple levels deep', () => {
    const target = { a: { b: { c: 1, d: 2 } } };
    lib.deepMerge(target, { a: { b: { d: 99 } } });
    assert.deepEqual(target, { a: { b: { c: 1, d: 99 } } });
  });
});

// ── extractCode ───────────────────────────────────────────────────────────────

describe('extractCode', () => {
  test('extracts from data.recipe.code', () => {
    const code = { number: 0, as: 'abc', block: [] };
    const data = { recipe: { code: JSON.stringify(code) } };
    assert.deepEqual(lib.extractCode(data), code);
  });

  test('extracts from flat data.code (no .recipe wrapper)', () => {
    const code = { number: 0, as: 'xyz', block: [] };
    const data = { code: JSON.stringify(code) };
    assert.deepEqual(lib.extractCode(data), code);
  });
});

// ── apiGet ────────────────────────────────────────────────────────────────────

describe('apiGet', () => {
  test('calls fetch with correct URL and Authorization header', async () => {
    lib.setConfig({ baseUrl: 'https://example.com/api', token: 'tok123' });
    let capturedUrl, capturedOpts;
    global.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedOpts = opts;
      return { ok: true, json: async () => ({ result: 'ok' }) };
    };
    await lib.apiGet('/recipes/1');
    assert.equal(capturedUrl, 'https://example.com/api/recipes/1');
    assert.equal(capturedOpts.headers['Authorization'], 'Bearer tok123');
  });

  test('throws with status code on non-ok response', async () => {
    global.fetch = async () => ({ ok: false, status: 404, text: async () => 'Not Found' });
    await assert.rejects(() => lib.apiGet('/recipes/999'), /404/);
  });
});

// ── apiPost ───────────────────────────────────────────────────────────────────

describe('apiPost', () => {
  test('sends POST with JSON body and correct headers', async () => {
    let capturedUrl, capturedOpts;
    global.fetch = async (url, opts) => {
      capturedUrl = url;
      capturedOpts = opts;
      return { ok: true, json: async () => ({ id: 1 }) };
    };
    const result = await lib.apiPost('/recipes', { recipe: { name: 'Test' } });
    assert.equal(capturedOpts.method, 'POST');
    assert.equal(capturedOpts.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(capturedOpts.body), { recipe: { name: 'Test' } });
    assert.deepEqual(result, { id: 1 });
  });

  test('throws on non-ok response', async () => {
    global.fetch = async () => ({ ok: false, status: 422, text: async () => 'Unprocessable' });
    await assert.rejects(() => lib.apiPost('/recipes', {}), /422/);
  });
});

// ── apiPut ────────────────────────────────────────────────────────────────────

describe('apiPut', () => {
  test('sends PUT with JSON body', async () => {
    let capturedOpts;
    global.fetch = async (url, opts) => {
      capturedOpts = opts;
      return { ok: true, json: async () => ({}) };
    };
    await lib.apiPut('/recipes/1', { recipe: { code: '{}' } });
    assert.equal(capturedOpts.method, 'PUT');
    assert.equal(capturedOpts.headers['Content-Type'], 'application/json');
  });
});

// ── apiDelete ─────────────────────────────────────────────────────────────────

describe('apiDelete', () => {
  test('sends DELETE request', async () => {
    let capturedMethod;
    global.fetch = async (url, opts) => {
      capturedMethod = opts.method;
      return { ok: true, text: async () => '' };
    };
    await lib.apiDelete('/recipes/1');
    assert.equal(capturedMethod, 'DELETE');
  });

  test('returns empty object when response body is empty', async () => {
    global.fetch = async () => ({ ok: true, text: async () => '' });
    const result = await lib.apiDelete('/recipes/1');
    assert.deepEqual(result, {});
  });

  test('parses and returns JSON body when present', async () => {
    global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ success: true }) });
    const result = await lib.apiDelete('/recipes/1');
    assert.deepEqual(result, { success: true });
  });

  test('throws on non-ok response', async () => {
    global.fetch = async () => ({ ok: false, status: 403, text: async () => 'Forbidden' });
    await assert.rejects(() => lib.apiDelete('/recipes/1'), /403/);
  });
});

// ── cmdGet ────────────────────────────────────────────────────────────────────

describe('cmdGet', () => {
  test('fetches recipe, writes file, and returns parsed code', async () => {
    const code = { number: 0, as: 'abc', block: [] };
    global.fetch = async () => ({ ok: true, json: async () => ({ recipe: { code: JSON.stringify(code) } }) });

    const written = {};
    const origWriteFile = require('fs').writeFileSync;
    try {
      require('fs').writeFileSync = (p, content) => { written[p] = content; };
      const result = await lib.cmdGet('123');
      assert.deepEqual(result, code);
      assert.ok(Object.keys(written).some(k => k.includes('recipe_123_code.json')), 'should write recipe_123_code.json');
    } finally {
      require('fs').writeFileSync = origWriteFile;
    }
  });
});

// ── cmdListRecipes ────────────────────────────────────────────────────────────

describe('cmdListRecipes', () => {
  test('calls /recipes with no query string by default', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({ items: [] }) }; };
    await lib.cmdListRecipes();
    assert.equal(calledUrl, 'https://example.com/api/recipes');
  });

  test('appends folder_id when provided', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListRecipes({ folder_id: '42' });
    assert.ok(calledUrl.includes('folder_id=42'), `URL was: ${calledUrl}`);
  });

  test('appends project_id when provided', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListRecipes({ project_id: '14318' });
    assert.ok(calledUrl.includes('project_id=14318'), `URL was: ${calledUrl}`);
  });

  test('appends page when provided', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListRecipes({ page: '2' });
    assert.ok(calledUrl.includes('page=2'), `URL was: ${calledUrl}`);
  });
});

// ── cmdListProjects ───────────────────────────────────────────────────────────

describe('cmdListProjects', () => {
  test('calls /projects', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListProjects();
    assert.ok(calledUrl.endsWith('/projects'));
  });
});

// ── cmdListFolders ────────────────────────────────────────────────────────────

describe('cmdListFolders', () => {
  test('calls /folders with no params by default', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListFolders();
    assert.equal(calledUrl, 'https://example.com/api/folders');
  });

  test('appends parent_id when provided', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListFolders({ parent_id: '5' });
    assert.ok(calledUrl.includes('parent_id=5'), `URL was: ${calledUrl}`);
  });
});

// ── cmdListConnections ────────────────────────────────────────────────────────

describe('cmdListConnections', () => {
  test('calls /connections', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListConnections();
    assert.ok(calledUrl.endsWith('/connections'));
  });

  test('appends folder_id when provided', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListConnections({ folder_id: '20245' });
    assert.ok(calledUrl.includes('folder_id=20245'), `URL was: ${calledUrl}`);
  });
});

// ── cmdListDataTables ─────────────────────────────────────────────────────────

describe('cmdListDataTables', () => {
  test('calls /data_tables', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListDataTables();
    assert.ok(calledUrl.endsWith('/data_tables'));
  });

  test('appends project_id when provided', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListDataTables({ project_id: '14318' });
    assert.ok(calledUrl.includes('project_id=14318'), `URL was: ${calledUrl}`);
  });
});

// ── cmdGetDataTable ───────────────────────────────────────────────────────────

describe('cmdGetDataTable', () => {
  test('calls /data_tables/:id', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdGetDataTable('3512');
    assert.ok(calledUrl.endsWith('/data_tables/3512'));
  });
});

// ── cmdGetJobs ────────────────────────────────────────────────────────────────

describe('cmdGetJobs', () => {
  test('calls /recipes/:id/jobs', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdGetJobs('167603');
    assert.ok(calledUrl.includes('/recipes/167603/jobs'));
  });

  test('appends per_page from limit option', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdGetJobs('167603', { limit: '10' });
    assert.ok(calledUrl.includes('per_page=10'), `URL was: ${calledUrl}`);
  });

  test('appends status filter', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdGetJobs('167603', { status: 'failed' });
    assert.ok(calledUrl.includes('status=failed'), `URL was: ${calledUrl}`);
  });
});

// ── cmdGetJob ─────────────────────────────────────────────────────────────────

describe('cmdGetJob', () => {
  test('calls /recipes/:id/jobs/:job_id', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdGetJob('167603', 'job-abc');
    assert.ok(calledUrl.endsWith('/recipes/167603/jobs/job-abc'));
  });
});

// ── cmdCreate ─────────────────────────────────────────────────────────────────

describe('cmdCreate', () => {
  test('reads code file and POSTs to /recipes with name and code', async () => {
    const code = { number: 0, as: 'abc', block: [] };
    const origRead = require('fs').readFileSync;
    try {
      require('fs').readFileSync = () => JSON.stringify(code);
      let postedBody;
      global.fetch = async (url, opts) => {
        postedBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({ recipe: { id: 99 } }) };
      };
      await lib.cmdCreate('My Recipe', 'code.json');
      assert.equal(postedBody.recipe.name, 'My Recipe');
      assert.deepEqual(JSON.parse(postedBody.recipe.code), code);
    } finally {
      require('fs').readFileSync = origRead;
    }
  });
});

// ── cmdCreateApiTrigger ───────────────────────────────────────────────────────

describe('cmdCreateApiTrigger', () => {
  test('POSTs recipe with workato_api_platform trigger code', async () => {
    let postedBody;
    global.fetch = async (url, opts) => {
      postedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ recipe: { id: 100 } }) };
    };
    await lib.cmdCreateApiTrigger('Test Trigger Recipe');
    const code = JSON.parse(postedBody.recipe.code);
    assert.equal(code.provider, 'workato_api_platform');
    assert.equal(code.keyword, 'trigger');
    assert.equal(postedBody.recipe.name, 'Test Trigger Recipe');
  });

  test('sets config with workato_api_platform application', async () => {
    let postedBody;
    global.fetch = async (url, opts) => {
      postedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ recipe: { id: 100 } }) };
    };
    await lib.cmdCreateApiTrigger('Trigger Recipe');
    const config = JSON.parse(postedBody.recipe.config);
    assert.equal(config[0].provider, 'workato_api_platform');
  });

  test('trigger code has as, uuid, and empty block', async () => {
    let postedBody;
    global.fetch = async (url, opts) => {
      postedBody = JSON.parse(opts.body);
      return { ok: true, json: async () => ({ recipe: { id: 100 } }) };
    };
    await lib.cmdCreateApiTrigger('Trigger Recipe');
    const code = JSON.parse(postedBody.recipe.code);
    assert.ok(code.as, 'should have an as field');
    assert.ok(code.uuid, 'should have a uuid field');
    assert.deepEqual(code.block, []);
  });
});

// ── cmdUpdateStep ─────────────────────────────────────────────────────────────

describe('cmdUpdateStep', () => {
  test('updates the trigger step (top-level, matched by as)', async () => {
    const code = {
      as: 'trig0001', keyword: 'trigger', provider: 'workato_api_platform',
      input: { request: { content_type: 'json' } },
      block: [],
    };
    const patch = { input: { request: { content_type: 'multipart' } } };
    const origRead = require('fs').readFileSync;
    try {
      require('fs').readFileSync = () => JSON.stringify(patch);
      let putBody;
      global.fetch = async (url, opts) => {
        if (opts?.method === 'PUT') {
          putBody = JSON.parse(opts.body);
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({ recipe: { code: JSON.stringify(code) } }) };
      };
      await lib.cmdUpdateStep('123', 'trig0001', 'patch.json');
      const updated = JSON.parse(putBody.recipe.code);
      assert.equal(updated.input.request.content_type, 'multipart');
    } finally {
      require('fs').readFileSync = origRead;
    }
  });

  test('updates a nested action step', async () => {
    const code = {
      as: 'trig0001', keyword: 'trigger', input: {},
      block: [
        { as: 'act00001', keyword: 'action', input: { lang: 'en' } },
      ],
    };
    const patch = { input: { lang: 'fr' } };
    const origRead = require('fs').readFileSync;
    try {
      require('fs').readFileSync = () => JSON.stringify(patch);
      let putBody;
      global.fetch = async (url, opts) => {
        if (opts?.method === 'PUT') {
          putBody = JSON.parse(opts.body);
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({ recipe: { code: JSON.stringify(code) } }) };
      };
      await lib.cmdUpdateStep('123', 'act00001', 'patch.json');
      const updated = JSON.parse(putBody.recipe.code);
      assert.equal(updated.block[0].input.lang, 'fr');
    } finally {
      require('fs').readFileSync = origRead;
    }
  });

  test('throws when step as-id is not found', async () => {
    const code = { as: 'trig0001', keyword: 'trigger', block: [] };
    const origRead = require('fs').readFileSync;
    try {
      require('fs').readFileSync = () => JSON.stringify({});
      global.fetch = async () => ({ ok: true, json: async () => ({ recipe: { code: JSON.stringify(code) } }) });
      await assert.rejects(
        () => lib.cmdUpdateStep('123', 'notfound', 'patch.json'),
        /not found/,
      );
    } finally {
      require('fs').readFileSync = origRead;
    }
  });

  test('deep-merges patch without clobbering sibling keys', async () => {
    const code = {
      as: 'trig0001', keyword: 'trigger',
      input: { a: 1, b: 2 },
      block: [],
    };
    const patch = { input: { b: 99 } };
    const origRead = require('fs').readFileSync;
    try {
      require('fs').readFileSync = () => JSON.stringify(patch);
      let putBody;
      global.fetch = async (url, opts) => {
        if (opts?.method === 'PUT') {
          putBody = JSON.parse(opts.body);
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({ recipe: { code: JSON.stringify(code) } }) };
      };
      await lib.cmdUpdateStep('123', 'trig0001', 'patch.json');
      const updated = JSON.parse(putBody.recipe.code);
      assert.equal(updated.input.a, 1, 'sibling key a should be preserved');
      assert.equal(updated.input.b, 99, 'key b should be updated');
    } finally {
      require('fs').readFileSync = origRead;
    }
  });
});

// ── cmdPutCode ────────────────────────────────────────────────────────────────

describe('cmdPutCode', () => {
  test('reads code file and PUTs full code to /recipes/:id', async () => {
    const code = { number: 0, as: 'abc', block: [] };
    const origRead = require('fs').readFileSync;
    try {
      require('fs').readFileSync = () => JSON.stringify(code);
      let putUrl, putBody;
      global.fetch = async (url, opts) => {
        putUrl = url;
        putBody = JSON.parse(opts.body);
        return { ok: true, json: async () => ({}) };
      };
      await lib.cmdPutCode('123', 'code.json');
      assert.ok(putUrl.endsWith('/recipes/123'));
      assert.deepEqual(JSON.parse(putBody.recipe.code), code);
    } finally {
      require('fs').readFileSync = origRead;
    }
  });
});

// ── cmdStart ──────────────────────────────────────────────────────────────────

describe('cmdStart', () => {
  test('PUTs to /recipes/:id/start', async () => {
    let calledUrl, calledMethod;
    global.fetch = async (url, opts) => {
      calledUrl = url;
      calledMethod = opts.method;
      return { ok: true, json: async () => ({}) };
    };
    await lib.cmdStart('123');
    assert.ok(calledUrl.endsWith('/recipes/123/start'));
    assert.equal(calledMethod, 'PUT');
  });
});

// ── cmdStop ───────────────────────────────────────────────────────────────────

describe('cmdStop', () => {
  test('PUTs to /recipes/:id/stop', async () => {
    let calledUrl, calledMethod;
    global.fetch = async (url, opts) => {
      calledUrl = url;
      calledMethod = opts.method;
      return { ok: true, json: async () => ({}) };
    };
    await lib.cmdStop('123');
    assert.ok(calledUrl.endsWith('/recipes/123/stop'));
    assert.equal(calledMethod, 'PUT');
  });
});

// ── cmdDelete ─────────────────────────────────────────────────────────────────

describe('cmdDelete', () => {
  test('DELETEs /recipes/:id', async () => {
    let calledMethod, calledUrl;
    global.fetch = async (url, opts) => {
      calledMethod = opts.method;
      calledUrl = url;
      return { ok: true, text: async () => '' };
    };
    await lib.cmdDelete('123');
    assert.equal(calledMethod, 'DELETE');
    assert.ok(calledUrl.endsWith('/recipes/123'));
  });

  test('returns parsed response body', async () => {
    global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ success: true }) });
    const result = await lib.cmdDelete('123');
    assert.deepEqual(result, { success: true });
  });
});

// ── loadEnv ───────────────────────────────────────────────────────────────────

describe('loadEnv', () => {
  function tmpEnvFile(content) {
    const p = path.join(os.tmpdir(), `.workato-test-${Date.now()}-${Math.random()}`);
    fs.writeFileSync(p, content);
    return p;
  }

  test('parses key=value and sets process.env', () => {
    const f = tmpEnvFile('WTEST_SIMPLE=hello_world\n');
    try {
      delete process.env.WTEST_SIMPLE;
      lib.loadEnv(f);
      assert.equal(process.env.WTEST_SIMPLE, 'hello_world');
    } finally {
      fs.unlinkSync(f);
      delete process.env.WTEST_SIMPLE;
    }
  });

  test('parses multiple key=value pairs', () => {
    const f = tmpEnvFile('WTEST_A=foo\nWTEST_B=bar\n');
    try {
      delete process.env.WTEST_A;
      delete process.env.WTEST_B;
      lib.loadEnv(f);
      assert.equal(process.env.WTEST_A, 'foo');
      assert.equal(process.env.WTEST_B, 'bar');
    } finally {
      fs.unlinkSync(f);
      delete process.env.WTEST_A;
      delete process.env.WTEST_B;
    }
  });

  test('ignores comment lines starting with #', () => {
    const f = tmpEnvFile('# WTEST_COMMENT=should_not_be_set\n');
    try {
      delete process.env.WTEST_COMMENT;
      lib.loadEnv(f);
      assert.equal(process.env.WTEST_COMMENT, undefined);
    } finally {
      fs.unlinkSync(f);
    }
  });

  test('ignores blank lines without throwing', () => {
    const f = tmpEnvFile('\nWTEST_BLANK=set\n\n');
    try {
      delete process.env.WTEST_BLANK;
      lib.loadEnv(f);
      assert.equal(process.env.WTEST_BLANK, 'set');
    } finally {
      fs.unlinkSync(f);
      delete process.env.WTEST_BLANK;
    }
  });

  test('handles value containing = sign', () => {
    const f = tmpEnvFile('WTEST_EQUALS=a=b=c\n');
    try {
      delete process.env.WTEST_EQUALS;
      lib.loadEnv(f);
      assert.equal(process.env.WTEST_EQUALS, 'a=b=c');
    } finally {
      fs.unlinkSync(f);
      delete process.env.WTEST_EQUALS;
    }
  });

  test('does not throw when file does not exist', () => {
    assert.doesNotThrow(() => lib.loadEnv('/nonexistent/path/that/does/not/exist/.env'));
  });

  test('defaults to cwd/.env when no path argument given', () => {
    // Should not throw even if cwd/.env doesn't exist
    assert.doesNotThrow(() => lib.loadEnv());
  });

  test('later calls overwrite earlier values (last writer wins)', () => {
    const f1 = tmpEnvFile('WTEST_OVERWRITE=first\n');
    const f2 = tmpEnvFile('WTEST_OVERWRITE=second\n');
    try {
      delete process.env.WTEST_OVERWRITE;
      lib.loadEnv(f1);
      lib.loadEnv(f2);
      assert.equal(process.env.WTEST_OVERWRITE, 'second');
    } finally {
      fs.unlinkSync(f1);
      fs.unlinkSync(f2);
      delete process.env.WTEST_OVERWRITE;
    }
  });
});

// ── getToken / setConfig ──────────────────────────────────────────────────────

describe('getToken', () => {
  test('returns config.token when explicitly set', () => {
    lib.setConfig({ token: 'config-tok' });
    process.env.WORKATO_API_TOKEN = 'env-tok';
    assert.equal(lib.getToken(), 'config-tok');
    process.env.WORKATO_API_TOKEN = 'test-token';
    lib.setConfig({ token: 'tok' });
  });

  test('falls back to WORKATO_API_TOKEN env var when config token is null', () => {
    lib.setConfig({ token: null });
    process.env.WORKATO_API_TOKEN = 'env-fallback';
    assert.equal(lib.getToken(), 'env-fallback');
    process.env.WORKATO_API_TOKEN = 'test-token';
    lib.setConfig({ token: 'tok' });
  });
});

describe('setConfig', () => {
  test('updates baseUrl used by API calls', async () => {
    lib.setConfig({ baseUrl: 'https://custom.example.com/api', token: 'tok' });
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.apiGet('/test');
    assert.ok(calledUrl.startsWith('https://custom.example.com/api'));
    lib.setConfig({ baseUrl: 'https://example.com/api' });
  });
});

// ── apiTriggerCode ────────────────────────────────────────────────────────────

describe('apiTriggerCode', () => {
  test('returns correct provider, keyword, and name', () => {
    const code = lib.apiTriggerCode();
    assert.equal(code.provider, 'workato_api_platform');
    assert.equal(code.keyword, 'trigger');
    assert.equal(code.name, 'receive_request');
  });

  test('as field is a non-empty string', () => {
    const code = lib.apiTriggerCode();
    assert.ok(typeof code.as === 'string' && code.as.length > 0);
  });

  test('uuid field matches UUID format', () => {
    const code = lib.apiTriggerCode();
    assert.match(code.uuid, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  test('generates unique as values on successive calls', () => {
    const codes = Array.from({ length: 5 }, () => lib.apiTriggerCode());
    const asValues = new Set(codes.map(c => c.as));
    assert.equal(asValues.size, 5, 'all as values should be unique');
  });

  test('has empty block array and empty schemas', () => {
    const code = lib.apiTriggerCode();
    assert.deepEqual(code.block, []);
    assert.deepEqual(code.extended_output_schema, []);
    assert.deepEqual(code.extended_input_schema, []);
  });

  test('input includes request and response sub-objects', () => {
    const code = lib.apiTriggerCode();
    assert.ok(code.input.request);
    assert.ok(code.input.response);
    assert.equal(code.input.request.content_type, 'json');
  });
});

// ── apiTriggerConfig ──────────────────────────────────────────────────────────

describe('apiTriggerConfig', () => {
  test('returns array with exactly one entry', () => {
    assert.equal(lib.apiTriggerConfig().length, 1);
  });

  test('entry has correct provider and keyword', () => {
    const [entry] = lib.apiTriggerConfig();
    assert.equal(entry.provider, 'workato_api_platform');
    assert.equal(entry.keyword, 'application');
    assert.equal(entry.account_id, null);
    assert.equal(entry.skip_validation, false);
  });
});

// ── findStep — edge cases ─────────────────────────────────────────────────────

describe('findStep — edge cases', () => {
  test('does not throw when a step has no block property', () => {
    const block = [
      { as: 'aaa', keyword: 'action' }, // no .block
      { as: 'bbb', keyword: 'action' },
    ];
    assert.doesNotThrow(() => lib.findStep(block, 'zzz'));
    assert.equal(lib.findStep(block, 'zzz'), null);
  });

  test('finds first match when same as appears multiple times (degenerate)', () => {
    const block = [
      { as: 'dup', keyword: 'action', value: 1 },
      { as: 'dup', keyword: 'action', value: 2 },
    ];
    assert.equal(lib.findStep(block, 'dup').value, 1);
  });
});

// ── deepMerge — edge cases ────────────────────────────────────────────────────

describe('deepMerge — edge cases', () => {
  test('null source value replaces target value', () => {
    const target = { a: 'something' };
    lib.deepMerge(target, { a: null });
    assert.equal(target.a, null);
  });

  test('empty source object leaves target unchanged', () => {
    const target = { a: 1, b: 2 };
    lib.deepMerge(target, {});
    assert.deepEqual(target, { a: 1, b: 2 });
  });

  test('array in target is fully replaced when source has same key as array', () => {
    const target = { steps: [{ as: 'x' }] };
    lib.deepMerge(target, { steps: [] });
    assert.deepEqual(target.steps, []);
  });
});

// ── apiPut error path ─────────────────────────────────────────────────────────

describe('apiPut — error handling', () => {
  test('throws with status code on non-ok response', async () => {
    global.fetch = async () => ({ ok: false, status: 409, text: async () => 'Conflict' });
    await assert.rejects(() => lib.apiPut('/recipes/1', {}), /409/);
  });
});

// ── cmdListRecipes — multiple filters ────────────────────────────────────────

describe('cmdListRecipes — multiple filters', () => {
  test('appends folder_id and page together', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListRecipes({ folder_id: '42', page: '3' });
    assert.ok(calledUrl.includes('folder_id=42'), `URL: ${calledUrl}`);
    assert.ok(calledUrl.includes('page=3'), `URL: ${calledUrl}`);
  });

  test('appends project_id and per_page together', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdListRecipes({ project_id: '14318', per_page: '50' });
    assert.ok(calledUrl.includes('project_id=14318'), `URL: ${calledUrl}`);
    assert.ok(calledUrl.includes('per_page=50'), `URL: ${calledUrl}`);
  });
});

// ── cmdGetJobs — combined filters ────────────────────────────────────────────

describe('cmdGetJobs — combined filters', () => {
  test('appends both per_page and status', async () => {
    let calledUrl;
    global.fetch = async (url) => { calledUrl = url; return { ok: true, json: async () => ({}) }; };
    await lib.cmdGetJobs('167603', { limit: '5', status: 'succeeded' });
    assert.ok(calledUrl.includes('per_page=5'), `URL: ${calledUrl}`);
    assert.ok(calledUrl.includes('status=succeeded'), `URL: ${calledUrl}`);
  });
});

// ── error propagation from write commands ─────────────────────────────────────

describe('error propagation', () => {
  test('cmdStart propagates API error', async () => {
    global.fetch = async () => ({ ok: false, status: 500, text: async () => 'Internal Server Error' });
    await assert.rejects(() => lib.cmdStart('123'), /500/);
  });

  test('cmdStop propagates API error', async () => {
    global.fetch = async () => ({ ok: false, status: 422, text: async () => 'Unprocessable' });
    await assert.rejects(() => lib.cmdStop('123'), /422/);
  });

  test('cmdDelete propagates API error', async () => {
    global.fetch = async () => ({ ok: false, status: 403, text: async () => 'Forbidden' });
    await assert.rejects(() => lib.cmdDelete('123'), /403/);
  });

  test('cmdPutCode propagates API error', async () => {
    const origRead = require('fs').readFileSync;
    try {
      require('fs').readFileSync = () => JSON.stringify({ as: 'x', block: [] });
      global.fetch = async () => ({ ok: false, status: 400, text: async () => 'Bad Request' });
      await assert.rejects(() => lib.cmdPutCode('123', 'code.json'), /400/);
    } finally {
      require('fs').readFileSync = origRead;
    }
  });

  test('cmdCreate propagates API error', async () => {
    const origRead = require('fs').readFileSync;
    try {
      require('fs').readFileSync = () => JSON.stringify({ as: 'x' });
      global.fetch = async () => ({ ok: false, status: 422, text: async () => 'Unprocessable' });
      await assert.rejects(() => lib.cmdCreate('Bad Recipe', 'code.json'), /422/);
    } finally {
      require('fs').readFileSync = origRead;
    }
  });

  test('cmdGet propagates API error', async () => {
    global.fetch = async () => ({ ok: false, status: 404, text: async () => 'Not Found' });
    await assert.rejects(() => lib.cmdGet('9999999'), /404/);
  });

  test('cmdListRecipes propagates API error', async () => {
    global.fetch = async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' });
    await assert.rejects(() => lib.cmdListRecipes(), /401/);
  });
});

// ── cmdUpdateStep — deeply nested step ────────────────────────────────────────

describe('cmdUpdateStep — deeply nested step', () => {
  test('updates a step nested three levels deep', async () => {
    const code = {
      as: 'trig', keyword: 'trigger', input: {},
      block: [
        {
          as: 'foreach1', keyword: 'foreach', input: {},
          block: [
            {
              as: 'if1', keyword: 'if', input: {},
              block: [
                { as: 'deepact', keyword: 'action', input: { x: 1 } },
              ],
            },
          ],
        },
      ],
    };
    const patch = { input: { x: 99 } };
    const origRead = require('fs').readFileSync;
    try {
      require('fs').readFileSync = () => JSON.stringify(patch);
      let putBody;
      global.fetch = async (url, opts) => {
        if (opts?.method === 'PUT') {
          putBody = JSON.parse(opts.body);
          return { ok: true, json: async () => ({}) };
        }
        return { ok: true, json: async () => ({ recipe: { code: JSON.stringify(code) } }) };
      };
      await lib.cmdUpdateStep('123', 'deepact', 'patch.json');
      const updated = JSON.parse(putBody.recipe.code);
      assert.equal(updated.block[0].block[0].block[0].input.x, 99);
    } finally {
      require('fs').readFileSync = origRead;
    }
  });
});

// ── cmdBootstrapClaude ────────────────────────────────────────────────────────

describe('cmdBootstrapClaude', () => {
  function tmpDir() {
    const d = path.join(os.tmpdir(), `workato-test-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  test('copies CLAUDE.md into the destination directory', () => {
    const dir = tmpDir();
    try {
      lib.cmdBootstrapClaude(dir);
      assert.ok(fs.existsSync(path.join(dir, 'CLAUDE.md')), 'CLAUDE.md should exist in dest dir');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('written file content matches the source CLAUDE.md', () => {
    const dir = tmpDir();
    try {
      lib.cmdBootstrapClaude(dir);
      const srcPath = path.join(__dirname, '..', 'CLAUDE.md');
      const src = fs.readFileSync(srcPath, 'utf8');
      const dest = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
      assert.equal(dest, src);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns the destination file path', () => {
    const dir = tmpDir();
    try {
      const result = lib.cmdBootstrapClaude(dir);
      assert.equal(result, path.join(dir, 'CLAUDE.md'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('overwrites an existing CLAUDE.md', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, 'CLAUDE.md'), 'old content');
      lib.cmdBootstrapClaude(dir);
      const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
      assert.notEqual(content, 'old content');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ── cmdAuth ───────────────────────────────────────────────────────────────────

describe('cmdAuth', () => {
  function tmpDir() {
    const d = path.join(os.tmpdir(), `workato-auth-test-${Date.now()}-${Math.random()}`);
    fs.mkdirSync(d, { recursive: true });
    return d;
  }

  test('creates .env with token when file does not exist', () => {
    const dir = tmpDir();
    try {
      lib.cmdAuth('mytoken123', dir);
      const content = fs.readFileSync(path.join(dir, '.env'), 'utf8');
      assert.ok(content.includes('WORKATO_API_TOKEN=mytoken123'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns the .env file path', () => {
    const dir = tmpDir();
    try {
      const result = lib.cmdAuth('tok', dir);
      assert.equal(result, path.join(dir, '.env'));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('updates existing WORKATO_API_TOKEN line in .env', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, '.env'), 'WORKATO_API_TOKEN=oldtoken\n');
      lib.cmdAuth('newtoken', dir);
      const content = fs.readFileSync(path.join(dir, '.env'), 'utf8');
      assert.ok(content.includes('WORKATO_API_TOKEN=newtoken'), 'should have new token');
      assert.ok(!content.includes('oldtoken'), 'should not have old token');
      assert.equal((content.match(/WORKATO_API_TOKEN=/g) || []).length, 1, 'only one token line');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('appends token to .env that has other keys but no WORKATO_API_TOKEN', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, '.env'), 'OTHER_KEY=value\n');
      lib.cmdAuth('mytoken', dir);
      const content = fs.readFileSync(path.join(dir, '.env'), 'utf8');
      assert.ok(content.includes('OTHER_KEY=value'), 'existing key preserved');
      assert.ok(content.includes('WORKATO_API_TOKEN=mytoken'), 'token appended');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('token value containing = is preserved verbatim', () => {
    const dir = tmpDir();
    try {
      lib.cmdAuth('tok==extra==', dir);
      const content = fs.readFileSync(path.join(dir, '.env'), 'utf8');
      assert.ok(content.includes('WORKATO_API_TOKEN=tok==extra=='));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('preserves other keys in .env when updating token', () => {
    const dir = tmpDir();
    try {
      fs.writeFileSync(path.join(dir, '.env'), 'FOO=bar\nWORKATO_API_TOKEN=old\nBAZ=qux\n');
      lib.cmdAuth('updated', dir);
      const content = fs.readFileSync(path.join(dir, '.env'), 'utf8');
      assert.ok(content.includes('FOO=bar'), 'FOO preserved');
      assert.ok(content.includes('BAZ=qux'), 'BAZ preserved');
      assert.ok(content.includes('WORKATO_API_TOKEN=updated'), 'token updated');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Restore console at end
process.on('exit', () => {
  console.log = origLog;
  console.error = origError;
});

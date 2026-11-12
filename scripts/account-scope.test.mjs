import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repo = fileURLToPath(new URL('../', import.meta.url));
const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : 'bash';
const shellPath = value => process.platform === 'win32' ? value.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive) => `/${drive.toLowerCase()}`) : value;

test('actual workflow account guards reject unset/foreign accounts before resource access', async () => {
  const temp = await mkdtemp(join(repo, '.platform-controls-'));
  try {
    const bin = join(temp, 'bin');
    const log = join(temp, 'aws.log');
    await mkdir(bin);
    await writeFile(join(bin, 'aws'), '#!/usr/bin/env bash\nset -euo pipefail\n[[ "$*" == "sts get-caller-identity --query Account --output text" ]]\nprintf "identity\\n" >> "$GUARD_LOG"\nprintf "%s\\n" "$FAKE_ACCOUNT"\n', { mode: 0o755 });
    for (const workflow of ['deploy.yml', 'plan.yml', 'recover-nodes.yml']) {
      const source = await readFile(join(repo, '.github', 'workflows', workflow), 'utf8');
      const guard = source.match(/      - name: Verify expected AWS account before resource access\r?\n[\s\S]*?        run: \|\r?\n((?:          [^\r\n]*\r?\n)+)/);
      assert.ok(guard, workflow);
      assert.ok(source.indexOf('aws-actions/configure-aws-credentials@v4') < source.indexOf(guard[0]));
      const script = guard[1].replace(/^          /gm, '').replaceAll('\r', '');
      for (const [expected, actual, success, probes] of [['', '111111111111', false, 0], ['111111111111', '222222222222', false, 1], ['111111111111', '111111111111', true, 1]]) {
        await writeFile(log, '');
        const result = spawnSync(bash, ['-c', script], { encoding: 'utf8', env: { ...process.env, PATH: bin + delimiter + process.env.PATH, EXPECTED_AWS_ACCOUNT_ID: expected, FAKE_ACCOUNT: actual, GUARD_LOG: shellPath(log) } });
        assert.equal(result.status === 0, success, `${workflow}: ${result.stderr}`);
        assert.equal((await readFile(log, 'utf8')).split('\n').filter(Boolean).length, probes);
      }
    }
  } finally {
    assert.ok(resolve(temp).startsWith(resolve(join(repo, '.platform-controls-'))));
    await rm(temp, { recursive: true, force: true });
  }
});

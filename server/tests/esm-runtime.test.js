import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('native ESM runtime', () => {
  it('imports the application factory with Node ESM', () => {
    const serverRoot = resolve(import.meta.dirname, '..');
    const appUrl = pathToFileURL(resolve(serverRoot, 'src', 'app.js')).href;
    const script = `import(${JSON.stringify(appUrl)}).then((module) => process.stdout.write(typeof module.createApp));`;

    const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
      cwd: serverRoot,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe('function');
  });
});

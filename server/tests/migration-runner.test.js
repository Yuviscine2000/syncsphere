import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  runMigrations,
  splitSqlStatements,
} from '../src/database/migrations/migration-runner.js';

const temporaryDirectories = [];

async function createMigrationDirectory(files) {
  const directory = await mkdtemp(join(tmpdir(), 'syncsphere-migrations-'));
  temporaryDirectories.push(directory);

  for (const [name, contents] of Object.entries(files)) {
    await writeFile(join(directory, name), contents, 'utf8');
  }

  return directory;
}

function createFakeMysqlClient() {
  const applied = new Set();
  const queries = [];
  const mysqlClient = {
    query: vi.fn(async (sql, parameters = []) => {
      queries.push({ sql, parameters });

      if (sql.includes('GET_LOCK')) {
        return { rows: [{ acquired: 1 }] };
      }

      if (sql.startsWith('SELECT name FROM schema_migrations')) {
        return { rows: [...applied].map((name) => ({ name })) };
      }

      if (sql.startsWith('INSERT INTO schema_migrations')) {
        applied.add(parameters[0]);
        return { rows: {} };
      }

      if (sql.startsWith('DELETE FROM schema_migrations')) {
        applied.delete(parameters[0]);
        return { rows: {} };
      }

      return { rows: [] };
    }),
  };

  return { mysqlClient, applied, queries };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe('SQL migration runner', () => {
  it('splits statements while preserving quoted semicolons and ignoring comments', () => {
    const statements = splitSqlStatements(`
      -- leading comment; ignored
      CREATE TABLE example (value VARCHAR(20) DEFAULT 'a;b');
      # hash comment; ignored
      INSERT INTO example (value) VALUES ('it\\'s; valid');
      INSERT INTO example (value) VALUES ('-- not a comment; # still a string');
      /* block comment; ignored */
      UPDATE example SET value = \`quoted;name\`;
    `);

    expect(statements).toEqual([
      "CREATE TABLE example (value VARCHAR(20) DEFAULT 'a;b')",
      "INSERT INTO example (value) VALUES ('it\\'s; valid')",
      "INSERT INTO example (value) VALUES ('-- not a comment; # still a string')",
      'UPDATE example SET value = `quoted;name`',
    ]);
  });

  it('applies pending migrations in order and skips already-applied files', async () => {
    const directory = await createMigrationDirectory({
      '001_one.up.sql': 'CREATE TABLE one (id INT);',
      '001_one.down.sql': 'DROP TABLE one;',
      '002_two.up.sql': "CREATE TABLE two (value VARCHAR(10) DEFAULT 'a;b');",
      '002_two.down.sql': 'DROP TABLE two;',
    });
    const { mysqlClient, applied, queries } = createFakeMysqlClient();
    const logger = { info: vi.fn(), warn: vi.fn() };

    const first = await runMigrations({
      mysqlClient,
      logger,
      migrationsDir: directory,
    });
    const second = await runMigrations({
      mysqlClient,
      logger,
      migrationsDir: directory,
    });

    expect(first).toEqual({
      applied: ['001_one', '002_two'],
      skipped: [],
    });
    expect(second).toEqual({
      applied: [],
      skipped: ['001_one', '002_two'],
    });
    expect(applied).toEqual(new Set(['001_one', '002_two']));
    expect(
      queries.some(({ sql }) =>
        sql.includes("CREATE TABLE two (value VARCHAR(10) DEFAULT 'a;b')"),
      ),
    ).toBe(true);
    expect(queries.at(-1).sql).toContain('RELEASE_LOCK');
  });

  it('reverts applied migrations in reverse order', async () => {
    const directory = await createMigrationDirectory({
      '001_one.up.sql': 'CREATE TABLE one (id INT);',
      '001_one.down.sql': 'DROP TABLE one;',
      '002_two.up.sql': 'CREATE TABLE two (id INT);',
      '002_two.down.sql': 'DROP TABLE two;',
    });
    const { mysqlClient, applied, queries } = createFakeMysqlClient();
    const logger = { info: vi.fn(), warn: vi.fn() };

    await runMigrations({ mysqlClient, logger, migrationsDir: directory });
    const result = await runMigrations({
      mysqlClient,
      logger,
      direction: 'down',
      migrationsDir: directory,
    });

    expect(result).toEqual({
      applied: ['002_two', '001_one'],
      skipped: [],
    });
    expect(applied.size).toBe(0);

    const downStatements = queries
      .map(({ sql }) => sql)
      .filter((sql) => sql === 'DROP TABLE one' || sql === 'DROP TABLE two');
    expect(downStatements).toEqual(['DROP TABLE two', 'DROP TABLE one']);
  });

  it('releases the advisory lock when a migration fails', async () => {
    const directory = await createMigrationDirectory({
      '001_failure.up.sql': 'CREATE TABLE broken (id INT);',
      '001_failure.down.sql': 'DROP TABLE broken;',
    });
    const logger = { info: vi.fn(), warn: vi.fn() };
    const mysqlClient = {
      query: vi.fn(async (sql) => {
        if (sql.includes('GET_LOCK')) {
          return { rows: [{ acquired: 1 }] };
        }
        if (sql.startsWith('SELECT name FROM schema_migrations')) {
          return { rows: [] };
        }
        if (sql.startsWith('CREATE TABLE broken')) {
          throw new Error('syntax failure');
        }
        return { rows: [] };
      }),
    };

    await expect(
      runMigrations({ mysqlClient, logger, migrationsDir: directory }),
    ).rejects.toThrow('syntax failure');
    expect(
      mysqlClient.query.mock.calls.some(([sql]) => sql.includes('RELEASE_LOCK')),
    ).toBe(true);
  });

  it('rejects invalid migration directions', async () => {
    const { mysqlClient } = createFakeMysqlClient();

    await expect(
      runMigrations({
        mysqlClient,
        logger: { info: vi.fn(), warn: vi.fn() },
        direction: 'sideways',
      }),
    ).rejects.toThrow('Migration direction');
  });
});

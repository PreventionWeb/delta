import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const VALIDATION_DB_DIR = path.resolve(PROJECT_ROOT, "migration_validation_db");
const DEFAULT_INPUT = path.resolve(VALIDATION_DB_DIR, "dts_db_pglite.sql");
const DEFAULT_OUTPUT = path.resolve(VALIDATION_DB_DIR, "migration-validation-report.md");
const VALIDATION_DB_NAME = process.env.MIGRATION_VALIDATION_DB ?? "dts_db_migration_validation";
const POSTGRES_ADMIN = {
  host: "localhost",
  port: 5432,
  user: "postgres",
  password: "postgres",
  database: "postgres",
};

function buildPgUrl(dbName: string): string {
  return `postgresql://postgres:postgres@localhost:5432/${dbName}`;
}

function truncateForReport(text: string, maxLength = 2000): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 80)}? [truncated ${text.length - maxLength + 80} chars]`;
}

function runCommand(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env ?? process.env,
    encoding: "utf8",
    stdio: "pipe",
  });

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).map((part) => truncateForReport(String(part), 4000)).join("\n");
    throw new Error(`${command} ${args.join(" ")} failed\n${truncateForReport(output || "unknown error")}`);
  }

  return `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
}

function detectDumpCompatibility(filePath: string): { issues: string[]; summary: string } {
  const sql = fs.readFileSync(filePath, "utf8");
  const checks = [
    {
      name: "PostgreSQL metadata",
      predicate: (text: string) => text.includes("COMMENT ON") || text.includes("-- Name: ") && text.includes("Owner:"),
    },
    {
      name: "Extension creation",
      predicate: (text: string) => text.includes("CREATE EXTENSION IF NOT EXISTS"),
    },
    {
      name: "Function bodies",
      predicate: (text: string) => text.includes("CREATE FUNCTION") && text.includes("AS $$"),
    },
    {
      name: "Enumerated types",
      predicate: (text: string) => text.includes("CREATE TYPE") && text.includes("AS ENUM"),
    },
    {
      name: "Ownership clauses",
      predicate: (text: string) => /ALTER (TABLE|SEQUENCE|FUNCTION|TYPE).* OWNER TO/i.test(text),
    },
    {
      name: "Triggers",
      predicate: (text: string) => text.includes("CREATE TRIGGER") || /ALTER TABLE .* DISABLE TRIGGER/i.test(text),
    },
  ];

  const issues: string[] = [];
  for (const check of checks) {
    const seen = check.predicate(sql);
    if (seen) {
      issues.push(check.name);
    }
  }

  const summary =
    issues.length === 0
      ? "No PostgreSQL-only dump metadata or object definitions were detected in the backup file."
      : `Detected PostgreSQL-specific dump constructs: ${issues.join("; ")}. This validates the need for a real PostgreSQL restore instead of a direct PGlite load.`;

  return { issues, summary };
}

async function ensureFreshDatabase(): Promise<void> {
  const restoreEnv = {
    ...process.env,
    PGPASSWORD: "postgres",
  };

  const dropdb = process.platform === "win32" ? "dropdb.exe" : "dropdb";
  const createdb = process.platform === "win32" ? "createdb.exe" : "createdb";

  const dropResult = spawnSync(
    dropdb,
    ["-h", "localhost", "-U", "postgres", "--if-exists", VALIDATION_DB_NAME],
    {
      cwd: PROJECT_ROOT,
      env: restoreEnv,
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (dropResult.status !== 0 && dropResult.status !== null) {
    const output = [dropResult.stdout, dropResult.stderr].filter(Boolean).map((part) => truncateForReport(String(part), 4000)).join("\n");
    throw new Error(`Failed to drop validation database ${VALIDATION_DB_NAME}\n${truncateForReport(output || "unknown error")}`);
  }

  const createResult = spawnSync(
    createdb,
    ["-h", "localhost", "-U", "postgres", VALIDATION_DB_NAME],
    {
      cwd: PROJECT_ROOT,
      env: restoreEnv,
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (createResult.status !== 0) {
    const output = [createResult.stdout, createResult.stderr].filter(Boolean).map((part) => truncateForReport(String(part), 4000)).join("\n");
    throw new Error(`Failed to create validation database ${VALIDATION_DB_NAME}\n${truncateForReport(output || "unknown error")}`);
  }
}

async function loadSqlIntoDatabase(filePath: string): Promise<void> {
  await ensureFreshDatabase();

  const psqlCommand = process.platform === "win32" ? "psql.exe" : "psql";
  const restoreEnv = {
    ...process.env,
    PGPASSWORD: "postgres",
  };

  const result = spawnSync(
    psqlCommand,
    ["-h", "localhost", "-U", "postgres", "-d", VALIDATION_DB_NAME, "-f", filePath],
    {
      cwd: PROJECT_ROOT,
      env: restoreEnv,
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).map((part) => truncateForReport(String(part), 4000)).join("\n");
    throw new Error(`SQL restore failed for ${VALIDATION_DB_NAME}\n${truncateForReport(output || "unknown error")}`);
  }
}

async function runDrizzleMigration(): Promise<string> {
  const yarnCommand = process.platform === "win32" ? "yarn.cmd" : "yarn";
  const migrationEnv = {
    ...process.env,
    DATABASE_URL: buildPgUrl(VALIDATION_DB_NAME),
    PGPASSWORD: "postgres",
  };

  const result = spawnSync(yarnCommand, ["dbsync"], {
    cwd: PROJECT_ROOT,
    env: migrationEnv,
    encoding: "utf8",
    stdio: "pipe",
  });

  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");
  if (result.status !== 0) {
    throw new Error(`Drizzle migration failed\n${truncateForReport(output || "unknown error")}`);
  }

  return output;
}

function buildReport(rows: Array<{ Check: string; Status: string; Table: string; Expected: string; Actual: string; Details: string }>): string {
  const header = `| Check | Status | Table(s) | Expected | Actual | Details |
| --- | --- | --- | --- | --- | --- |`;
  const body = rows
    .map((row) => {
      const check = truncateForReport(String(row.Check), 120);
      const status = truncateForReport(String(row.Status), 40);
      const table = truncateForReport(String(row.Table), 120);
      const expected = truncateForReport(String(row.Expected), 240);
      const actual = truncateForReport(String(row.Actual), 240);
      const details = truncateForReport(String(row.Details), 700);
      return `| ${check} | ${status} | ${table} | ${expected} | ${actual} | ${details} |`;
    })
    .join("\n");

  const passed = rows.every((row) => row.Status === "Pass");

  return `# Migration validation report

Overall status: **${passed ? "PASS" : "FAIL"}**

${header}
${body}
`;
}

async function getDbClient() {
  const client = new Client({
    host: "localhost",
    port: 5432,
    user: "postgres",
    password: "postgres",
    database: VALIDATION_DB_NAME,
  });
  await client.connect();
  return client;
}

async function getCount(client: Client, sqlText: string): Promise<number> {
  try {
    const result = await client.query(sqlText);
    return Number(result.rows[0]?.c ?? 0);
  } catch {
    return 0;
  }
}

async function validateMigrationState(client: Client): Promise<Array<{ Check: string; Status: string; Table: string; Expected: string; Actual: string; Details: string }>> {
  const rows: Array<{ Check: string; Status: string; Table: string; Expected: string; Actual: string; Details: string }> = [];

  const hipClassCount = await getCount(client, "SELECT count(*) as c FROM public.hip_class");
  const hazardTypeCount = await getCount(client, "SELECT count(*) as c FROM public.hazard_type");
  const hipClusterCount = await getCount(client, "SELECT count(*) as c FROM public.hip_cluster");
  const hazardClusterCount = await getCount(client, "SELECT count(*) as c FROM public.hazard_cluster");
  const hipHazardCount = await getCount(client, "SELECT count(*) as c FROM public.hip_hazard");
  const specificHazardCount = await getCount(client, "SELECT count(*) as c FROM public.specific_hazard");

  const hipMatch = hipClassCount === hazardTypeCount && hipClusterCount === hazardClusterCount && hipHazardCount === specificHazardCount;
  rows.push({
    Check: "HIP migration parity",
    Status: hipMatch ? "Pass" : "Fail",
    Table: "public.hip_class, public.hazard_type; public.hip_cluster, public.hazard_cluster; public.hip_hazard, public.specific_hazard",
    Expected: "Legacy HIP counts match migrated target counts",
    Actual: `hip_class=${hipClassCount}, hazard_type=${hazardTypeCount}; hip_cluster=${hipClusterCount}, hazard_cluster=${hazardClusterCount}; hip_hazard=${hipHazardCount}, specific_hazard=${specificHazardCount}`,
    Details: hipMatch
      ? "Legacy HIP tables and rebuilt target tables have matching counts."
      : "One or more HIP source/target tables have mismatched counts, indicating a partial or failed migration.",
  });

  const totalLanguageCount = await getCount(client, "SELECT count(*) as c FROM public.language");
  const normalizedLanguageCount = await getCount(
    client,
    "SELECT count(*) as c FROM public.language WHERE char_length(language_cd) = 2 AND language_name IS NOT NULL",
  );
  const languageOk = totalLanguageCount > 0 && normalizedLanguageCount === totalLanguageCount;

  rows.push({
    Check: "Language normalization",
    Status: languageOk ? "Pass" : "Fail",
    Table: "public.language",
    Expected: "Every language code is 2 characters and has a readable language_name",
    Actual: `total=${totalLanguageCount}, normalized=${normalizedLanguageCount}`,
    Details: languageOk
      ? "All stored language rows are in the expected two-character format and have names."
      : "The language table contains rows that are not normalized or are missing required metadata.",
  });

  const textContentCount = await getCount(client, "SELECT count(*) as c FROM public.text_content");
  const translationCount = await getCount(client, "SELECT count(*) as c FROM public.translation");
  const nullTranslationFks = await getCount(
    client,
    "SELECT count(*) as c FROM public.translation WHERE text_content_id IS NULL OR language_id IS NULL",
  );
  const missingOriginalLanguage = await getCount(
    client,
    "SELECT count(*) as c FROM public.text_content WHERE original_language_id IS NULL",
  );
  const missingSameLanguageBackfill = await getCount(
    client,
    "SELECT count(*) as c FROM public.text_content tc WHERE NOT EXISTS (SELECT 1 FROM public.translation t WHERE t.text_content_id = tc.id AND t.language_id = tc.original_language_id)",
  );
  const mismatchedSameLanguageBackfill = await getCount(
    client,
    "SELECT count(*) as c FROM public.translation t JOIN public.text_content tc ON tc.id = t.text_content_id WHERE t.language_id = tc.original_language_id AND t.translation <> tc.original_text",
  );

  const translationMigrationOk =
    textContentCount > 0 &&
    translationCount > 0 &&
    nullTranslationFks === 0 &&
    missingOriginalLanguage === 0 &&
    missingSameLanguageBackfill === 0 &&
    mismatchedSameLanguageBackfill === 0;

  rows.push({
    Check: "HIP translation migration",
    Status: translationMigrationOk ? "Pass" : "Fail",
    Table: "public.text_content, public.translation",
    Expected: "Each HIP text item has a non-null original language, and a same-language translation row matching the original text exists for every text_content row",
    Actual: `text_content=${textContentCount}, translation=${translationCount}, null_fk=${nullTranslationFks}, missing_original_language=${missingOriginalLanguage}, missing_same_language_backfill=${missingSameLanguageBackfill}, mismatched_same_language_backfill=${mismatchedSameLanguageBackfill}`,
    Details: translationMigrationOk
      ? "HIP multilingual text-content rows were created and every same-language translation row matches the source text."
      : "HIP migration is missing one or more translation rows or the original-language mapping is invalid. This matches the migration logic in the HIP multilingual migration files.",
  });

  const workflowInstanceCount = await getCount(client, "SELECT count(*) as c FROM public.workflow_instance");
  rows.push({
    Check: "Workflow instance migration",
    Status: workflowInstanceCount > 0 ? "Pass" : "Fail",
    Table: "public.workflow_instance",
    Expected: "Workflow instances should exist after migration",
    Actual: String(workflowInstanceCount),
    Details: workflowInstanceCount > 0
      ? "Workflow-instance rows exist, matching the expected migrated state."
      : "No workflow_instance rows were found. This indicates the workflow migration was not applied or the backup predates that migration.",
  });

  const spatialObservationCount = await getCount(
    client,
    "SELECT count(*) as c FROM public.hazardous_event_spatial_observation",
  );
  rows.push({
    Check: "Spatial observation migration",
    Status: spatialObservationCount > 0 ? "Pass" : "Fail",
    Table: "public.hazardous_event_spatial_observation",
    Expected: "Distinct hazardous-event spatial observations should exist after migration",
    Actual: String(spatialObservationCount),
    Details: spatialObservationCount > 0
      ? "Spatial observation rows exist."
      : "No spatial-observation rows were found; the spatial migration is absent or not yet deployed in this snapshot.",
  });

  const causalityCount = await getCount(client, "SELECT count(*) as c FROM public.hazardous_event_causality");
  rows.push({
    Check: "Event causality migration",
    Status: causalityCount > 0 ? "Pass" : "Fail",
    Table: "public.hazardous_event_causality",
    Expected: "Causality rows should exist after migration from event_relationship",
    Actual: String(causalityCount),
    Details: causalityCount > 0
      ? "Causality rows exist."
      : "No hazardous_event_causality rows were found; the event-causality migration is absent or not yet applied.",
  });

  const workflowNotificationCount = await getCount(client, "SELECT count(*) as c FROM public.workflow_notification");
  rows.push({
    Check: "Workflow notification bootstrap",
    Status: workflowNotificationCount > 0 ? "Pass" : "Fail",
    Table: "public.workflow_notification",
    Expected: "Workflow notifications should be created as part of validation workflow migration",
    Actual: String(workflowNotificationCount),
    Details: workflowNotificationCount > 0
      ? "Notification rows are present."
      : "No workflow notification rows were found. This is a likely sign the validation-workflow migration has not run.",
  });

  return rows;
}

async function main() {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT;
  const outputPath = process.argv[3] ?? DEFAULT_OUTPUT;
  const rows: Array<{ Check: string; Status: string; Table: string; Expected: string; Actual: string; Details: string }> = [];

  try {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Input SQL file not found: ${inputPath}`);
    }

    const dumpCheck = detectDumpCompatibility(inputPath);
    rows.push({
      Check: "Backup compatibility detection",
      Status: dumpCheck.issues.length > 0 ? "Warn" : "Pass",
      Table: "raw dump",
      Expected: "The backup should be reviewed for PostgreSQL-only metadata before any PGlite-style load",
      Actual: dumpCheck.issues.length > 0 ? "Detected raw dump compatibility issues" : "No obvious dump compatibility issues detected",
      Details: `${dumpCheck.summary} This validation workflow restores the dump into a real PostgreSQL database because direct PGlite execution is not a safe validation target for this backup.`,
    });

    await loadSqlIntoDatabase(inputPath);
    rows.push({
      Check: "Backup restore into PostgreSQL",
      Status: "Pass",
      Table: "public",
      Expected: "Database restore succeeds in a real PostgreSQL instance",
      Actual: VALIDATION_DB_NAME,
      Details: `The SQL dump was restored into PostgreSQL using postgres/postgres credentials on localhost:5432.`,
    });

    const migrationOutput = await runDrizzleMigration();
    rows.push({
      Check: "Drizzle migration",
      Status: "Pass",
      Table: "drizzle migrations",
      Expected: "yarn dbsync completes successfully against the validation database",
      Actual: "Completed",
      Details: migrationOutput.slice(0, 400) || "Migration command succeeded.",
    });

    const client = await getDbClient();
    try {
      const migrationRows = await validateMigrationState(client);
      rows.push(...migrationRows);
    } finally {
      await client.end();
    }

    const report = buildReport(rows);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, report, "utf8");

    console.log(report);
    console.log(`Report written to ${outputPath}`);
  } catch (error) {
    const message = truncateForReport(error instanceof Error ? error.message : String(error));
    rows.push({
      Check: "PostgreSQL restore & validation",
      Status: "Fail",
      Table: "public",
      Expected: "Validation database is created, restored, and migrated successfully",
      Actual: "0",
      Details: message,
    });

    const report = buildReport(rows);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, report, "utf8");

    console.error("Migration validation failed");
    console.error(message);
    console.error(`Report written to ${outputPath}`);
    process.exitCode = 1;
  }
}

void main();




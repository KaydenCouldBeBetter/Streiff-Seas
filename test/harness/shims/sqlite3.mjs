// A stand-in for the sqlite3 command line (test/harness/deployKit.ts), so the tests need no
// sqlite3 binary: `sqlite3 -readonly <db> <sql>` runs the very query the script passes against
// the real SQLite file through node:sqlite, and prints rows the way sqlite3 does (columns
// joined by "|"). An error exits 1, as sqlite3 does.
import { appendFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const argv = process.argv.slice(2);
appendFileSync(path.join(process.env.SHIM_DIR, "calls.log"), JSON.stringify({ tool: "sqlite3", argv }) + "\n");

const readOnly = argv[0] === "-readonly";
const [file, sql] = readOnly ? argv.slice(1) : argv;
try {
  const db = new DatabaseSync(file, { readOnly, open: true });
  for (const row of db.prepare(sql).all()) process.stdout.write(Object.values(row).join("|") + "\n");
  db.close();
} catch (error) {
  process.stderr.write(`Error: ${error.message}\n`);
  process.exit(1);
}

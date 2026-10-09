import "server-only";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { seedActivity, seedCampaigns, USERS } from "./seed";

// SQLite database (better-sqlite3, synchronous API). One connection per server process, kept on
// `globalThis` so dev hot reload doesn't open a new one on every change.
//
// The file lives in the OS temp directory, NOT in the project: `next dev` watches the project
// folder, and SQLite touches its files even on reads (WAL/shm), which made Turbopack rebuild and
// reload the page after every request. The file survives server restarts; `npm run db:reset`
// deletes it. DATABASE_PATH overrides the location (tests use ":memory:").

export const DEFAULT_DATABASE_PATH = path.join(os.tmpdir(), "campaign-builder", "campaign-builder.sqlite");
const DATABASE_PATH = process.env.DATABASE_PATH ?? DEFAULT_DATABASE_PATH;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id   TEXT PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS campaigns (
    id         TEXT PRIMARY KEY,
    slug       TEXT NOT NULL UNIQUE,
    name       TEXT NOT NULL,
    status     TEXT NOT NULL,
    objective  TEXT NOT NULL,
    owner_id   TEXT NOT NULL REFERENCES users (id),
    audience   TEXT NOT NULL, -- JSON RuleGroup
    budget     TEXT NOT NULL, -- JSON Budget
    schedule   TEXT NOT NULL, -- JSON Schedule
    creatives  TEXT NOT NULL, -- JSON Creative[]
    spend      INTEGER NOT NULL,
    version    INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    -- Copies of JSON fields used for filtering and sorting. SQLite keeps them in sync itself.
    budget_amount  INTEGER GENERATED ALWAYS AS (json_extract(budget, '$.amount')) STORED,
    schedule_start TEXT    GENERATED ALWAYS AS (json_extract(schedule, '$.start')) STORED,
    schedule_end   TEXT    GENERATED ALWAYS AS (json_extract(schedule, '$.end')) STORED
  );

  CREATE INDEX IF NOT EXISTS campaigns_by_updated_at ON campaigns (updated_at, id);

  CREATE TABLE IF NOT EXISTS activity (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id TEXT NOT NULL REFERENCES campaigns (id),
    at          TEXT NOT NULL,
    actor_id    TEXT NOT NULL REFERENCES users (id),
    message     TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS activity_by_campaign ON activity (campaign_id, at, id);

  CREATE TABLE IF NOT EXISTS preferences (
    user_id TEXT PRIMARY KEY REFERENCES users (id),
    data    TEXT NOT NULL -- JSON Preferences
  );
`;

const globalForDb = globalThis as unknown as { campaignDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalForDb.campaignDb) {
    globalForDb.campaignDb = openDatabase();
  }
  return globalForDb.campaignDb;
}

function openDatabase() {
  if (DATABASE_PATH !== ":memory:") fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

  const db = new Database(DATABASE_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);

  const { count } = db.prepare("SELECT count(*) AS count FROM campaigns").get() as { count: number };
  if (count === 0) seed(db);
  return db;
}

/** Fills an empty database in one transaction (~1 s for 50k campaigns). */
function seed(db: Database.Database) {
  const insertUser = db.prepare("INSERT INTO users (id, name) VALUES (@id, @name)");
  const insertCampaign = db.prepare(`
    INSERT INTO campaigns (id, slug, name, status, objective, owner_id, audience, budget, schedule, creatives,
                           spend, version, created_at, updated_at)
    VALUES (@id, @slug, @name, @status, @objective, @ownerId, @audience, @budget, @schedule, @creatives,
            @spend, @version, @createdAt, @updatedAt)
  `);
  const insertActivity = db.prepare(
    "INSERT INTO activity (campaign_id, at, actor_id, message) VALUES (@campaignId, @at, @actorId, @message)",
  );

  db.transaction(() => {
    for (const user of USERS) insertUser.run(user);
    for (const campaign of seedCampaigns(USERS.map((user) => user.id))) {
      insertCampaign.run({
        ...campaign,
        audience: JSON.stringify(campaign.audience),
        budget: JSON.stringify(campaign.budget),
        schedule: JSON.stringify(campaign.schedule),
        creatives: JSON.stringify(campaign.creatives),
      });
      for (const entry of seedActivity(campaign)) insertActivity.run({ campaignId: campaign.id, ...entry });
    }
  })();
}

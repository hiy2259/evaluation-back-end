import { resolve } from 'node:path';
import { existsSync, mkdirSync, copyFileSync } from 'node:fs';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { connectDb, disconnectDb } from '../db.js';
import { Division, Team, Criterion, Judge, Settings, SETTINGS_ID } from '../models/index.js';
import {
  loadSeedFromFile,
  CRITERIA_SEED,
  EXPECTED_DIVISIONS,
  EXPECTED_TEAMS,
  EXPECTED_CRITERIA,
} from './parse-md.js';

const DEFAULT_EXTERNAL_MD = '/Users/yongs/workspace/Skill/팀별_스킬_정리.md';

function resolveSeedMdPath(): string {
  const configured = resolve(config.seedMdPath);
  if (existsSync(configured)) return configured;
  if (existsSync(DEFAULT_EXTERNAL_MD)) {
    const dir = resolve('./seed-data');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const dest = resolve(dir, '팀별_스킬_정리.md');
    if (!existsSync(dest)) copyFileSync(DEFAULT_EXTERNAL_MD, dest);
    return dest;
  }
  throw new Error(
    `Seed md not found at ${configured} nor fallback ${DEFAULT_EXTERNAL_MD}. Set SEED_MD_PATH or place the file under ./seed-data/.`,
  );
}

function fail(msg: string): never {
  console.error(`[seed] ABORT: ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const seedPath = resolveSeedMdPath();
  console.log(`[seed] source: ${seedPath}`);
  const parsed = loadSeedFromFile(seedPath);

  if (parsed.divisions.length !== EXPECTED_DIVISIONS) {
    fail(`divisions count mismatch: expected ${EXPECTED_DIVISIONS}, got ${parsed.divisions.length} (${parsed.divisions.join(', ')})`);
  }
  if (parsed.teams.length !== EXPECTED_TEAMS) {
    fail(`teams count mismatch: expected ${EXPECTED_TEAMS}, got ${parsed.teams.length}`);
  }
  if (CRITERIA_SEED.length !== EXPECTED_CRITERIA) {
    fail(`criteria count mismatch: expected ${EXPECTED_CRITERIA}, got ${CRITERIA_SEED.length}`);
  }

  await connectDb();
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      await Division.deleteMany({}, { session });
      await Team.deleteMany({}, { session });
      await Criterion.deleteMany({}, { session });

      const divDocs = await Division.insertMany(
        parsed.divisions.map((name) => ({ name })),
        { session },
      );
      const divByName = new Map<string, mongoose.Types.ObjectId>();
      for (const d of divDocs) divByName.set(d.name, d._id as mongoose.Types.ObjectId);

      const teamPayload = parsed.teams.map((t) => {
        const divId = divByName.get(t.divisionName);
        if (!divId) throw new Error(`Unknown division for team ${t.name}: ${t.divisionName}`);
        return {
          divisionId: divId,
          name: t.name,
          projectName: t.projectName,
          owner: t.owner,
          members: t.members,
          oneLiner: t.oneLiner,
        };
      });
      await Team.insertMany(teamPayload, { session });

      await Criterion.insertMany(CRITERIA_SEED.map((c) => ({ ...c })), { session });
    });
  } catch (err) {
    await session.endSession();
    await disconnectDb();
    fail(`transaction failed: ${(err as Error).message}`);
  }
  await session.endSession();

  await seedAdmin();
  await seedSettings();

  const [dCount, tCount, cCount] = await Promise.all([
    Division.countDocuments(),
    Team.countDocuments(),
    Criterion.countDocuments(),
  ]);
  if (dCount !== EXPECTED_DIVISIONS) fail(`post-write divisions=${dCount}, expected ${EXPECTED_DIVISIONS}`);
  if (tCount !== EXPECTED_TEAMS) fail(`post-write teams=${tCount}, expected ${EXPECTED_TEAMS}`);
  if (cCount !== EXPECTED_CRITERIA) fail(`post-write criteria=${cCount}, expected ${EXPECTED_CRITERIA}`);
  const weightSum = CRITERIA_SEED.reduce((s, c) => s + c.weight, 0);
  if (weightSum !== 100) fail(`criteria weights sum=${weightSum}, expected 100`);

  console.log(`[seed] OK divisions=${dCount} teams=${tCount} criteria=${cCount} weightSum=${weightSum}`);
  await disconnectDb();
}

async function seedAdmin(): Promise<void> {
  const name = process.env.ADMIN_NAME?.trim();
  const pin = process.env.ADMIN_PIN?.trim();
  if (!name || !pin) {
    console.log('[seed] ADMIN_NAME/ADMIN_PIN not provided; skipping admin seed.');
    return;
  }
  if (!/^\d{4}$/.test(pin)) {
    fail('ADMIN_PIN must be 4 digits');
  }
  const existing = await Judge.findOne({ name }).lean();
  const pinHash = await bcrypt.hash(pin, config.bcryptRounds);
  if (existing) {
    await Judge.updateOne(
      { name },
      { $set: { pinHash, role: 'admin', active: true } },
    );
    console.log(`[seed] admin "${name}" updated (PIN reset)`);
  } else {
    await Judge.create({ name, pinHash, role: 'admin', active: true });
    console.log(`[seed] admin "${name}" created`);
  }
}

async function seedSettings(): Promise<void> {
  const existing = await Settings.findById(SETTINGS_ID).lean();
  if (!existing) {
    await Settings.create({ _id: SETTINGS_ID, disclosureOpen: false, updatedAt: new Date() });
    console.log('[seed] settings singleton created (disclosureOpen=false)');
  } else {
    console.log('[seed] settings singleton exists; left untouched');
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(async (err) => {
    console.error('[seed] fatal:', err);
    try {
      await disconnectDb();
    } catch {
      /* ignore */
    }
    process.exit(1);
  });
}

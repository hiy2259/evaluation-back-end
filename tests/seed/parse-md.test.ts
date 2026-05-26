import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  parseSeedMarkdown,
  CRITERIA_SEED,
  EXPECTED_DIVISIONS,
  EXPECTED_TEAMS,
  EXPECTED_CRITERIA,
} from '../../src/seed/parse-md.js';

const FIXTURE_CANDIDATES = [
  resolve(__dirname, '../../seed-data/팀별_스킬_정리.md'),
  '/Users/yongs/workspace/Skill/팀별_스킬_정리.md',
];

function loadFixture(): string {
  for (const p of FIXTURE_CANDIDATES) {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      /* try next */
    }
  }
  throw new Error('seed md fixture not found');
}

describe('parseSeedMarkdown', () => {
  const md = loadFixture();
  const parsed = parseSeedMarkdown(md);

  it('parses exactly EXPECTED_DIVISIONS divisions', () => {
    expect(parsed.divisions.length).toBe(EXPECTED_DIVISIONS);
  });

  it('parses exactly EXPECTED_TEAMS teams', () => {
    expect(parsed.teams.length).toBe(EXPECTED_TEAMS);
  });

  it('assigns every team to a known division', () => {
    const divSet = new Set(parsed.divisions);
    for (const t of parsed.teams) {
      expect(divSet.has(t.divisionName)).toBe(true);
    }
  });

  it('populates projectName and oneLiner for every team', () => {
    for (const t of parsed.teams) {
      expect(t.projectName.length).toBeGreaterThan(0);
      expect(t.oneLiner.length).toBeGreaterThan(0);
    }
  });

  it('populates owner for every team', () => {
    for (const t of parsed.teams) {
      expect(t.owner.length).toBeGreaterThan(0);
    }
  });

  it('captures members list for at least one team (presence check)', () => {
    const withMembers = parsed.teams.filter((t) => t.members.length > 0);
    expect(withMembers.length).toBeGreaterThan(0);
  });
});

describe('CRITERIA_SEED', () => {
  it(`has exactly ${EXPECTED_CRITERIA} criteria`, () => {
    expect(CRITERIA_SEED.length).toBe(EXPECTED_CRITERIA);
  });

  it('weights sum to 100', () => {
    const sum = CRITERIA_SEED.reduce((s, c) => s + c.weight, 0);
    expect(sum).toBe(100);
  });

  it('orders are 1..N unique', () => {
    const orders = CRITERIA_SEED.map((c) => c.order).sort((a, b) => a - b);
    expect(orders).toEqual([1, 2, 3, 4, 5]);
  });
});

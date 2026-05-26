import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { rankTeams } from '../../src/stats/rankTeams.js';
import type { ICriterion, IEvaluation, ITeam } from '../../shared/types.js';

interface GoldenCase {
  id: string;
  description: string;
  teams: Array<{ _id: string; divisionId: string }>;
  evaluations: Array<{
    judgeId: string;
    teamId: string;
    scores: Record<string, number>;
  }>;
  expected: {
    order: string[];
    needsTfDecision: Record<string, boolean>;
  };
}

interface GoldenFile {
  criteria: ICriterion[];
  cases: GoldenCase[];
}

const fixturePath = resolve(__dirname, '../fixtures/tiebreak-golden.json');
const golden = JSON.parse(readFileSync(fixturePath, 'utf8')) as GoldenFile;

function toEvaluations(c: GoldenCase): IEvaluation[] {
  return c.evaluations.map((e, i) => ({
    _id: `e${i}`,
    judgeId: e.judgeId,
    teamId: e.teamId,
    scores: Object.entries(e.scores).map(([criterionId, value]) => ({ criterionId, value })),
    comment: '',
    version: 1,
    updatedAt: new Date().toISOString(),
  }));
}

function toTeams(c: GoldenCase): ITeam[] {
  return c.teams.map((t) => ({
    _id: t._id,
    divisionId: t.divisionId,
    name: t._id,
    projectName: '',
    owner: '',
    members: [],
    oneLiner: '',
  }));
}

describe('Golden tiebreak fixture (PDF 5단계)', () => {
  for (const c of golden.cases) {
    it(`${c.id} — ${c.description}`, () => {
      const ranked = rankTeams({
        evaluations: toEvaluations(c),
        criteria: golden.criteria,
        teams: toTeams(c),
      });
      const order = ranked.map((r) => r.teamId);
      expect(order).toEqual(c.expected.order);
      for (const [teamId, expected] of Object.entries(c.expected.needsTfDecision)) {
        const row = ranked.find((r) => r.teamId === teamId);
        expect(row?.needsTfDecision).toBe(expected);
      }
    });
  }
});

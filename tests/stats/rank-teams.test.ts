import { describe, it, expect } from 'vitest';
import { rankTeams } from '../../src/stats/rankTeams.js';
import type { ICriterion, IEvaluation, ITeam } from '../../shared/types.js';

const criteria: ICriterion[] = [
  { _id: 'c1', name: '문제 정의 명확성', weight: 20, indicator: '', order: 1 },
  { _id: 'c2', name: '구현 실현 가능성', weight: 30, indicator: '', order: 2 },
  { _id: 'c3', name: '차별성·독창성', weight: 20, indicator: '', order: 3 },
  { _id: 'c4', name: '업무 혁신성', weight: 15, indicator: '', order: 4 },
  { _id: 'c5', name: '확산 파급력', weight: 15, indicator: '', order: 5 },
];

const teams: ITeam[] = [
  { _id: 't1', divisionId: 'd1', name: 'T1', projectName: '', owner: '', members: [], oneLiner: '' },
  { _id: 't2', divisionId: 'd1', name: 'T2', projectName: '', owner: '', members: [], oneLiner: '' },
];

function ev(judgeId: string, teamId: string, values: [number, number, number, number, number]): IEvaluation {
  return {
    _id: `${judgeId}-${teamId}`,
    judgeId,
    teamId,
    scores: values.map((v, i) => ({ criterionId: `c${i + 1}`, value: v })),
    comment: '',
    version: 1,
    updatedAt: new Date().toISOString(),
  };
}

describe('rankTeams — weighted total', () => {
  it('환산점 = (value/5)*weight 합계로 계산된다', () => {
    const evals = [ev('j1', 't1', [5, 5, 5, 5, 5])];
    const r = rankTeams({ evaluations: evals, criteria, teams: [teams[0]] });
    expect(r[0].totalAvg).toBeCloseTo(100, 6);
  });

  it('절반 점수 → 환산 합도 절반', () => {
    const evals = [ev('j1', 't1', [3, 3, 3, 3, 3])];
    const r = rankTeams({ evaluations: evals, criteria, teams: [teams[0]] });
    expect(r[0].totalAvg).toBeCloseTo(60, 6);
  });

  it('여러 심사위원 평균', () => {
    const evals = [ev('j1', 't1', [5, 5, 5, 5, 5]), ev('j2', 't1', [3, 3, 3, 3, 3])];
    const r = rankTeams({ evaluations: evals, criteria, teams: [teams[0]] });
    expect(r[0].totalAvg).toBeCloseTo(80, 6);
  });
});

describe('rankTeams — STDEV quorum', () => {
  it('n=7 모두 같은 점수 → stddev=0', () => {
    const evals = Array.from({ length: 7 }, (_, i) => ev(`j${i}`, 't1', [4, 4, 4, 4, 4]));
    const r = rankTeams({ evaluations: evals, criteria, teams: [teams[0]] });
    expect(r[0].stddev).toBeCloseTo(0, 6);
    expect(r[0].submittedJudgeCount).toBe(7);
  });

  it('n=3 quorum 충족 → stddev 계산', () => {
    const evals = [
      ev('j1', 't1', [5, 5, 5, 5, 5]),
      ev('j2', 't1', [3, 3, 3, 3, 3]),
      ev('j3', 't1', [1, 1, 1, 1, 1]),
    ];
    const r = rankTeams({ evaluations: evals, criteria, teams: [teams[0]] });
    expect(r[0].stddev).not.toBeNull();
    expect(r[0].stddev!).toBeGreaterThan(0);
  });

  it('n=2 quorum 미달 → stddev=null', () => {
    const evals = [
      ev('j1', 't1', [5, 5, 5, 5, 5]),
      ev('j2', 't1', [3, 3, 3, 3, 3]),
    ];
    const r = rankTeams({ evaluations: evals, criteria, teams: [teams[0]] });
    expect(r[0].stddev).toBeNull();
    expect(r[0].submittedJudgeCount).toBe(2);
  });
});

describe('rankTeams — tie-break stages', () => {
  it('0차 가중 총점 desc', () => {
    const evals = [ev('j1', 't1', [5, 5, 5, 5, 5]), ev('j1', 't2', [3, 3, 3, 3, 3])];
    const r = rankTeams({ evaluations: evals, criteria, teams });
    expect(r[0].teamId).toBe('t1');
    expect(r[1].teamId).toBe('t2');
  });

  it('1차 구현 raw avg desc (order=2)', () => {
    const evals = [
      ev('j1', 't1', [5, 5, 5, 3, 5]),
      ev('j1', 't2', [5, 4, 5, 5, 5]),
    ];
    const t1Tot = (5 / 5) * 20 + (5 / 5) * 30 + (5 / 5) * 20 + (3 / 5) * 15 + (5 / 5) * 15;
    const t2Tot = (5 / 5) * 20 + (4 / 5) * 30 + (5 / 5) * 20 + (5 / 5) * 15 + (5 / 5) * 15;
    expect(t1Tot).toBe(t2Tot);
    const r = rankTeams({ evaluations: evals, criteria, teams });
    expect(r[0].teamId).toBe('t1');
  });

  it('4차 STDEV asc (작을수록 우선)', () => {
    const evals = [
      ev('j1', 't1', [3, 3, 3, 3, 3]),
      ev('j2', 't1', [3, 3, 3, 3, 3]),
      ev('j3', 't1', [3, 3, 3, 3, 3]),
      ev('j1', 't2', [1, 3, 3, 3, 3]),
      ev('j2', 't2', [5, 3, 3, 3, 3]),
      ev('j3', 't2', [3, 3, 3, 3, 3]),
    ];
    const r = rankTeams({ evaluations: evals, criteria, teams });
    expect(r[0].totalAvg).toBeCloseTo(r[1].totalAvg, 6);
    expect(r[0].teamId).toBe('t1');
    expect(r[0].stddev!).toBeLessThan(r[1].stddev!);
  });

  it('5차 모든 비교 동점 → needsTfDecision=true', () => {
    const evals = [
      ev('j1', 't1', [4, 4, 4, 4, 4]),
      ev('j2', 't1', [4, 4, 4, 4, 4]),
      ev('j3', 't1', [4, 4, 4, 4, 4]),
      ev('j1', 't2', [4, 4, 4, 4, 4]),
      ev('j2', 't2', [4, 4, 4, 4, 4]),
      ev('j3', 't2', [4, 4, 4, 4, 4]),
    ];
    const r = rankTeams({ evaluations: evals, criteria, teams });
    expect(r[0].needsTfDecision).toBe(true);
    expect(r[1].needsTfDecision).toBe(true);
  });
});

describe('rankTeams — submission filter', () => {
  it('점수 미완(빈 scores) 평가는 카운트 제외', () => {
    const evals: IEvaluation[] = [
      ev('j1', 't1', [5, 5, 5, 5, 5]),
      { _id: 'p', judgeId: 'j2', teamId: 't1', scores: [], comment: '', version: 0, updatedAt: new Date().toISOString() },
    ];
    const r = rankTeams({ evaluations: evals, criteria, teams: [teams[0]] });
    expect(r[0].submittedJudgeCount).toBe(1);
  });

  it('일부 항목 누락 평가도 제외', () => {
    const evals: IEvaluation[] = [
      ev('j1', 't1', [5, 5, 5, 5, 5]),
      { _id: 'p', judgeId: 'j2', teamId: 't1', scores: [{ criterionId: 'c1', value: 5 }], comment: '', version: 1, updatedAt: new Date().toISOString() },
    ];
    const r = rankTeams({ evaluations: evals, criteria, teams: [teams[0]] });
    expect(r[0].submittedJudgeCount).toBe(1);
  });
});

import type {
  ICriterion,
  IEvaluation,
  ITeam,
  RankedTeam,
  ScoreEntry,
} from '../../shared/types.js';

export interface RankTeamsInput {
  evaluations: IEvaluation[];
  criteria: ICriterion[];
  teams: ITeam[];
}

const ORDER_PROBLEM = 1;
const ORDER_FEASIBILITY = 2;
const ORDER_DIFFERENTIATION = 3;

const MIN_QUORUM = 3;

function scoreMap(scores: ScoreEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of scores) m.set(String(s.criterionId), s.value);
  return m;
}

function isSubmitted(scoreM: Map<string, number>, criteria: ICriterion[]): boolean {
  if (scoreM.size === 0) return false;
  for (const c of criteria) {
    const v = scoreM.get(String(c._id));
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 5) return false;
  }
  return true;
}

function pop_stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const sq = values.reduce((s, v) => s + (v - mean) * (v - mean), 0) / values.length;
  return Math.sqrt(sq);
}

function avg(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;
}

interface TeamScratch {
  teamId: string;
  divisionId: string;
  perJudgeTotals: number[];
  perCriterionRaw: Map<string, number[]>;
}

export function rankTeams({ evaluations, criteria, teams }: RankTeamsInput): RankedTeam[] {
  const teamById = new Map<string, ITeam>();
  for (const t of teams) teamById.set(String(t._id), t);

  const scratch = new Map<string, TeamScratch>();
  for (const t of teams) {
    scratch.set(String(t._id), {
      teamId: String(t._id),
      divisionId: String(t.divisionId),
      perJudgeTotals: [],
      perCriterionRaw: new Map(),
    });
  }

  const criterionById = new Map<string, ICriterion>();
  for (const c of criteria) criterionById.set(String(c._id), c);

  for (const ev of evaluations) {
    const teamId = String(ev.teamId);
    const sc = scratch.get(teamId);
    if (!sc) continue;
    const m = scoreMap(ev.scores);
    if (!isSubmitted(m, criteria)) continue;

    let totalWeighted = 0;
    for (const c of criteria) {
      const raw = m.get(String(c._id))!;
      totalWeighted += (raw / 5) * c.weight;
      const arr = sc.perCriterionRaw.get(String(c._id)) ?? [];
      arr.push(raw);
      sc.perCriterionRaw.set(String(c._id), arr);
    }
    sc.perJudgeTotals.push(totalWeighted);
  }

  const orderByCriterion = (order: number): ICriterion | undefined =>
    criteria.find((c) => c.order === order);
  const cFeas = orderByCriterion(ORDER_FEASIBILITY);
  const cDiff = orderByCriterion(ORDER_DIFFERENTIATION);
  const cProb = orderByCriterion(ORDER_PROBLEM);

  const ranked: RankedTeam[] = [];
  for (const sc of scratch.values()) {
    const submitted = sc.perJudgeTotals.length;
    const totalAvg = avg(sc.perJudgeTotals);
    const stddev = submitted >= MIN_QUORUM ? pop_stddev(sc.perJudgeTotals) : null;
    const perCriterionAvg: Record<string, number> = {};
    for (const c of criteria) {
      const arr = sc.perCriterionRaw.get(String(c._id)) ?? [];
      perCriterionAvg[String(c._id)] = avg(arr);
    }
    ranked.push({
      teamId: sc.teamId,
      divisionId: sc.divisionId,
      totalAvg,
      perCriterionAvg,
      stddev,
      submittedJudgeCount: submitted,
      needsTfDecision: false,
    });
  }

  const rawAvg = (r: RankedTeam, c?: ICriterion): number =>
    c ? r.perCriterionAvg[String(c._id)] ?? 0 : 0;

  const cmp = (a: RankedTeam, b: RankedTeam): number => {
    if (b.totalAvg !== a.totalAvg) return b.totalAvg - a.totalAvg;
    const f = rawAvg(b, cFeas) - rawAvg(a, cFeas);
    if (f !== 0) return f;
    const d = rawAvg(b, cDiff) - rawAvg(a, cDiff);
    if (d !== 0) return d;
    const p = rawAvg(b, cProb) - rawAvg(a, cProb);
    if (p !== 0) return p;
    const aStd = a.stddev ?? Number.POSITIVE_INFINITY;
    const bStd = b.stddev ?? Number.POSITIVE_INFINITY;
    if (aStd !== bStd) return aStd - bStd;
    return 0;
  };

  ranked.sort(cmp);

  for (let i = 0; i < ranked.length - 1; i++) {
    if (cmp(ranked[i], ranked[i + 1]) === 0 && ranked[i].submittedJudgeCount > 0 && ranked[i + 1].submittedJudgeCount > 0) {
      ranked[i].needsTfDecision = true;
      ranked[i + 1].needsTfDecision = true;
    }
  }

  return ranked;
}

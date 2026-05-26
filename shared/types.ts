// Single source of truth for shared domain types.
// Sync to frontend via `npm run sync-types` (copies to evaluation-front/src/types/shared.ts).

export type Role = 'judge' | 'admin';

export interface IJudge {
  _id: string;
  name: string;
  pinHash: string;
  active: boolean;
  role: Role;
  createdAt: string;
}

export type JudgePublic = Omit<IJudge, 'pinHash'>;

export interface IDivision {
  _id: string;
  name: string;
}

export interface ITeam {
  _id: string;
  divisionId: string;
  name: string;
  projectName: string;
  owner: string;
  members: string[];
  oneLiner: string;
}

export interface ICriterion {
  _id: string;
  name: string;
  weight: number;
  indicator: string;
  order: number;
}

export interface ScoreEntry {
  criterionId: string;
  value: number;
}

export interface IEvaluation {
  _id: string;
  judgeId: string;
  teamId: string;
  scores: ScoreEntry[];
  comment: string;
  version: number;
  updatedAt: string;
}

export interface ISettings {
  _id: 'singleton';
  disclosureOpen: boolean;
  updatedAt: string;
}

export interface RankedTeam {
  teamId: string;
  divisionId: string;
  totalAvg: number;
  perCriterionAvg: Record<string, number>;
  stddev: number | null;
  submittedJudgeCount: number;
  needsTfDecision: boolean;
}

export interface LoginRequest {
  name: string;
  pin: string;
}

export interface LoginResponse {
  token: string;
  judge: JudgePublic;
}

export interface AdminProgressEntry {
  judgeId: string;
  judgeName: string;
  completed: number;
  total: number;
}

export interface ErrorResponse {
  error: string;
  message?: string;
}

import { Router, type Response } from 'express';
import { Evaluation, Criterion, Team, Settings, SETTINGS_ID } from '../models/index.js';
import { requireJwt } from '../middleware/auth.js';
import { rankTeams } from '../stats/rankTeams.js';
import type { ICriterion, IEvaluation, ITeam } from '../../shared/types.js';

const router = Router();

router.get('/teams', requireJwt, async (req, res: Response) => {
  const auth = req.auth!;
  if (auth.role !== 'admin') {
    const settings = await Settings.findById(SETTINGS_ID).lean();
    if (!settings || settings.disclosureOpen !== true) {
      res.status(403).json({ error: 'forbidden', message: 'disclosure closed' });
      return;
    }
  }

  const [evDocs, critDocs, teamDocs] = await Promise.all([
    Evaluation.find({}).lean(),
    Criterion.find({}).sort({ order: 1 }).lean(),
    Team.find({}).lean(),
  ]);

  const evaluations: IEvaluation[] = evDocs.map((e) => ({
    _id: String(e._id),
    judgeId: String(e.judgeId),
    teamId: String(e.teamId),
    scores: (e.scores ?? []).map((s) => ({
      criterionId: String(s.criterionId),
      value: s.value,
    })),
    comment: e.comment ?? '',
    version: e.version ?? 0,
    updatedAt: new Date(e.updatedAt as unknown as string | Date).toISOString(),
  }));
  const criteria: ICriterion[] = critDocs.map((c) => ({
    _id: String(c._id),
    name: c.name,
    weight: c.weight,
    indicator: c.indicator ?? '',
    order: c.order,
  }));
  const teams: ITeam[] = teamDocs.map((t) => ({
    _id: String(t._id),
    divisionId: String(t.divisionId),
    name: t.name,
    projectName: t.projectName ?? '',
    owner: t.owner ?? '',
    members: (t.members ?? []) as string[],
    oneLiner: t.oneLiner ?? '',
  }));

  const ranked = rankTeams({ evaluations, criteria, teams });
  res.json(ranked);
});

export default router;

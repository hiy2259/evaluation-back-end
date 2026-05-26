import { Router } from 'express';
import { Team, Division } from '../models/index.js';
import { requireJwt } from '../middleware/auth.js';
import type { ITeam } from '../../shared/types.js';

const router = Router();

router.get('/', requireJwt, async (_req, res) => {
  const [teams, divisions] = await Promise.all([
    Team.find({}).lean(),
    Division.find({}).lean(),
  ]);
  const divName = new Map<string, string>();
  for (const d of divisions) divName.set(String(d._id), d.name);

  const body: Array<ITeam & { divisionName: string }> = teams.map((t) => ({
    _id: String(t._id),
    divisionId: String(t.divisionId),
    divisionName: divName.get(String(t.divisionId)) ?? '',
    name: t.name,
    projectName: t.projectName ?? '',
    owner: t.owner ?? '',
    members: (t.members ?? []) as string[],
    oneLiner: t.oneLiner ?? '',
  }));
  res.json(body);
});

export default router;

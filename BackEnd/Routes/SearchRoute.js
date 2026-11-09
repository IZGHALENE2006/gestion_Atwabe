import express from 'express';
import { auth } from '../middleware/auth.js';
import { searchApplication } from '../utils/globalSearch.js';
import { SEARCH_GROUPS, SEARCH_MIN_LENGTH, SEARCH_MAX_LENGTH, searchTokens } from '../../shared/globalSearch.js';

const router = express.Router();
router.get('/', auth, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!['admin', 'Employe'].includes(req.user?.role)) return res.status(403).json({ message: 'forbidden' });
  const { q, group = '' } = req.query;
  if (Object.keys(req.query).some(key => !['q', 'group'].includes(key)) || typeof q !== 'string' || q.trim().length < SEARCH_MIN_LENGTH || q.length > SEARCH_MAX_LENGTH || !searchTokens(q).length || [...q].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) || typeof group !== 'string' || group && !SEARCH_GROUPS.includes(group) || group === 'pages') return res.status(400).json({ message: 'invalidSearch' });
  try {
    const result = await searchApplication({ owner: req.user.idAdmin, actorId: req.user.id, role: req.user.role, user: req.employeeAccount, query: q.trim(), group, limit: group ? 24 : 6 });
    return res.json({ query: q.trim(), ...result });
  } catch { return res.status(500).json({ message: 'searchFailed' }); }
});
export default router;

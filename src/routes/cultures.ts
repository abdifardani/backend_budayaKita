import { Router } from 'express';
import Culture from '../models/Culture';

const router = Router();
router.get('/', async (req, res, next) => {
  try {
    const search = String(req.query.search || '').trim();
    const category = String(req.query.category || '').trim();
    const filter: any = {};
    if (category && category !== 'Semua') filter.category = category;
    if (search) filter.$or = [
      { title: { $regex: search, $options: 'i' } },
      { summary: { $regex: search, $options: 'i' } },
      { category: { $regex: search, $options: 'i' } },
    ];
    const items = await Culture.find(filter).sort({ title: 1 }).limit(100).lean();
    res.json({ data: items, count: items.length });
  } catch (error) { next(error); }
});
router.get('/:slug', async (req, res, next) => {
  try {
    const item = await Culture.findOne({ slug: req.params.slug }).lean();
    if (!item) return res.status(404).json({ error: 'Budaya tidak ditemukan' });
    return res.json({ data: item });
  } catch (error) { return next(error); }
});
export default router;

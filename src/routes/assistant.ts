import { Router } from 'express';
import { z } from 'zod';
import { answerCultureQuestion } from '../services/assistant';
const router = Router();
const bodySchema = z.object({ message: z.string().trim().min(2).max(1200) });
router.post('/', async (req, res, next) => {
  try {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Pesan wajib diisi (2–1200 karakter).' });
    const result = await answerCultureQuestion(parsed.data.message);
    return res.json(result);
  } catch (error) { return next(error); }
});
export default router;

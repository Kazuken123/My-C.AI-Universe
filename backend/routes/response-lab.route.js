import express from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { BaseController } from '../controllers/BaseController.js';
import { responseLabService as service } from '../services/response-lab.service.js';

class LabController extends BaseController {}
const controller = new LabController();
const router = express.Router();
// Detailed generation inputs are retained for export, not sent on every UI poll.
const reviewTrial = ({ context, prepared, ...trial }) => ({ ...trial,
  batches: trial.batches.map(({ writingPreferences, tournamentMemory, screeningAttempts, ...batch }) => ({ ...batch,
    candidates: batch.candidates.map(({ prompt, options, promptArm, approach, move, ...candidate }) =>
      batch.comparison ? candidate : { ...candidate, approach, move })
  }))
});
const route = fn => async (req, res) => {
  try { return controller.sendJson(res, await fn(req), req.method === 'POST' ? 201 : 200); }
  catch (error) { return controller.handleError(res, error, 'Response Lab request failed'); }
};
router.use('/response-lab', requireAuth);
router.get('/response-lab', route(req => service.repo.list(req.user.id)));
router.post('/response-lab', route(req => service.create(req.user.id, req.body)));
router.get('/response-lab/labs/:id', route(async req => ({ lab: await service.repo.get(req.params.id, req.user.id), trials: (await service.repo.trials(req.params.id, req.user.id)).map(reviewTrial) })));
router.delete('/response-lab/labs/:id', route(async req => { await service.repo.remove(req.params.id, req.user.id); return { deleted: true }; }));
router.get('/response-lab/labs/:id/export', route(req => service.export(req.user.id, req.params.id)));
router.post('/response-lab/labs/:id/trials', route(async req => reviewTrial(await service.newTrial(req.user.id, req.params.id, req.body))));
router.get('/response-lab/trials/:id', route(async req => {
  await service.repo.expire(req.user.id);
  return reviewTrial(await service.repo.trial(req.params.id, req.user.id));
}));
router.post('/response-lab/trials/:id/batches', route(async req => reviewTrial(await service.start(req.user.id, req.params.id, req.body))));
router.put('/response-lab/trials/:id/batches/:batchId/feedback', route(async req => reviewTrial(await service.feedback(req.user.id, req.params.id, req.params.batchId, req.body))));
router.post('/response-lab/trials/:id/branch', route(req => service.branch(req.user.id, req.params.id, req.body)));
export default router;

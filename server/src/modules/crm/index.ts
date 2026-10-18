import { Router } from 'express';
import { AppError } from '../../middleware/errorHandler';

/**
 * CRM (F2) is P1/P2 and not built yet. These routes answer 501 instead of returning empty
 * mock lists, so nobody mistakes the scaffold for working functionality.
 */
export const crmRouter = Router();

crmRouter.all('*', (_req, _res, next) => {
  next(new AppError('CRM endpoints are not implemented yet (planned for P1)', 501, 'NOT_IMPLEMENTED'));
});

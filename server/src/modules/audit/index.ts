import { Router, Request, Response } from 'express';
import { ApiResponse } from '../../../../shared/contracts/api';

export const auditRouter = Router();

auditRouter.get('/', async (req: Request, res: Response) => {
  const response: ApiResponse<{ events: []; total: number }> = {
    success: true,
    data: {
      events: [],
      total: 0,
    },
    meta: { timestamp: new Date().toISOString() },
  };
  res.status(200).json(response);
});

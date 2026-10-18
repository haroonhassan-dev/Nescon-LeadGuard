import { Router, Request, Response } from 'express';
import { ApiResponse } from '../../../../shared/contracts/api';

export const dashboardRouter = Router();

dashboardRouter.get('/summary', async (req: Request, res: Response) => {
  const response: ApiResponse<{
    activeLeads: number;
    pendingAcknowledgements: number;
    escalatedToday: number;
    revenueMonthToDateCents: number;
  }> = {
    success: true,
    data: {
      activeLeads: 0,
      pendingAcknowledgements: 0,
      escalatedToday: 0,
      revenueMonthToDateCents: 0,
    },
    meta: { timestamp: new Date().toISOString() },
  };
  res.status(200).json(response);
});

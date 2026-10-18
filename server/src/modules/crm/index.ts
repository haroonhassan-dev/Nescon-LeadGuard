import { Router, Request, Response } from 'express';
import { ApiResponse } from '../../../../shared/contracts/api';

export const crmRouter = Router();

// Contacts & Companies
crmRouter.get('/contacts', async (req: Request, res: Response) => {
  const response: ApiResponse<{ contacts: [] }> = {
    success: true,
    data: { contacts: [] },
    meta: { timestamp: new Date().toISOString() },
  };
  res.status(200).json(response);
});

crmRouter.get('/companies', async (req: Request, res: Response) => {
  const response: ApiResponse<{ companies: [] }> = {
    success: true,
    data: { companies: [] },
    meta: { timestamp: new Date().toISOString() },
  };
  res.status(200).json(response);
});

// Pipelines & Opportunities
crmRouter.get('/pipelines', async (req: Request, res: Response) => {
  const response: ApiResponse<{ pipelines: [] }> = {
    success: true,
    data: { pipelines: [] },
    meta: { timestamp: new Date().toISOString() },
  };
  res.status(200).json(response);
});

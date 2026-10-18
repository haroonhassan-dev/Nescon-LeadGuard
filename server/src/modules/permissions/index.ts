import { Router, Request, Response } from 'express';
import { ApiResponse } from '../../../../shared/contracts/api';

export const permissionsRouter = Router();

permissionsRouter.get('/', async (req: Request, res: Response) => {
  const response: ApiResponse<{ roles: []; permissionsCatalog: string[] }> = {
    success: true,
    data: {
      roles: [],
      permissionsCatalog: [
        'lead:create', 'lead:read', 'lead:update', 'lead:claim', 'lead:acknowledge', 'lead:escalate',
        'contact:create', 'contact:read', 'opportunity:create', 'opportunity:read',
        'integration:configure', 'audit:read', 'dashboard:read'
      ],
    },
    meta: { timestamp: new Date().toISOString() },
  };
  res.status(200).json(response);
});

import { Router, Request, Response } from 'express';
import { ApiResponse } from '../../../../shared/contracts/api';

export const authRouter = Router();

authRouter.post('/login', async (req: Request, res: Response) => {
  const response: ApiResponse<{ token: string; message: string }> = {
    success: true,
    data: {
      token: 'mock_jwt_token_for_scaffold',
      message: 'Auth module scaffold active. Handled by Backend Developer.',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
  res.status(200).json(response);
});

authRouter.get('/me', async (req: Request, res: Response) => {
  const response: ApiResponse<{ user: null; message: string }> = {
    success: true,
    data: {
      user: null,
      message: 'Auth session profile endpoint scaffold active.',
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
  res.status(200).json(response);
});

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { asyncHandler, ok, parse } from '../../lib/http';
import { rateLimit } from '../../lib/rateLimit';
import { AppError } from '../../middleware/errorHandler';
import { ingestLead } from '../leads/service';

/**
 * Public, unauthenticated endpoints. The web form identifies its workspace by an unguessable
 * per-workspace form key, never by a workspace id the visitor could change.
 */
export const publicRouter = Router();

const formLimiter = rateLimit({ name: 'public-form', windowMs: 60 * 1000, max: 10 });

const formSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().toLowerCase().email().max(254).optional().or(z.literal('').transform(() => undefined)),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 ()-]{6,20}$/, 'Phone number looks invalid')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    message: z.string().trim().max(2000).optional(),
    website: z.string().max(0, 'Spam check failed').optional(), // honeypot: real users leave it empty
  })
  .refine((v) => v.email || v.phone, { message: 'Please give an email or a phone number', path: ['email'] });

/** GET /api/public/forms/:formKey: lets a hosted form show the company name. */
publicRouter.get(
  '/forms/:formKey',
  formLimiter,
  asyncHandler(async (req, res) => {
    const workspace = await prisma.workspace.findUnique({ where: { publicFormKey: req.params.formKey } });
    if (!workspace || !workspace.isActive) throw new AppError('Form not found', 404, 'NOT_FOUND');
    ok(req, res, { companyName: workspace.name });
  })
);

/** POST /api/public/forms/:formKey/leads: web-form intake (F3.1, source WEB_FORM). */
publicRouter.post(
  '/forms/:formKey/leads',
  formLimiter,
  asyncHandler(async (req, res) => {
    const input = parse(formSchema, req.body);
    const workspace = await prisma.workspace.findUnique({ where: { publicFormKey: req.params.formKey } });
    if (!workspace || !workspace.isActive) throw new AppError('Form not found', 404, 'NOT_FOUND');

    await ingestLead({
      workspaceId: workspace.id,
      source: 'WEB_FORM',
      contactName: input.name,
      contactEmail: input.email,
      contactPhone: input.phone,
      message: input.message,
      actor: { type: 'SYSTEM', id: null, name: 'public web form' },
    });
    // The visitor gets a confirmation only; no internal ids or owner names.
    ok(req, res, { received: true, message: `Thanks! ${workspace.name} will contact you shortly.` }, 201);
  })
);

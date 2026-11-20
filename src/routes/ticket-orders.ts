import { Router } from 'express';
import { z } from 'zod';
import { sendCreated } from '../lib/response';
import { positiveIntSchema, uuidSchema } from '../lib/validation';
import { requireAuth } from '../middleware/auth';
import { getValidated, validate } from '../middleware/validate';
import { createTicketOrder } from '../services/ticket-orders';

export const ticketOrdersRouter = Router();

const createTicketOrderSchema = z
  .object({
    museum_id: uuidSchema,
    visit_date: z.string(),
    time_slot: z.string(),
    items: z.array(
      z
        .object({
          ticket_type_id: uuidSchema,
          quantity: positiveIntSchema,
        })
        .strict()
    ),
  })
  .strict();

type CreateTicketOrderBody = z.infer<typeof createTicketOrderSchema>;

ticketOrdersRouter.post(
  '/ticket-orders',
  requireAuth,
  validate({ body: createTicketOrderSchema }),
  async (req, res) => {
    const { body } = getValidated<CreateTicketOrderBody>(req);
    const result = await createTicketOrder({
      userId: req.auth!.userId,
      userEmail: req.auth!.email ?? null,
      museum_id: body.museum_id,
      visit_date: body.visit_date,
      time_slot: body.time_slot,
      items: body.items,
    });
    sendCreated(res, result);
  }
);

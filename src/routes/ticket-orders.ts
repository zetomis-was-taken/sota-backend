import { Router } from 'express';
import { z } from 'zod';
import { sendCreated, sendPaginated, sendSuccess } from '../lib/response';
import {
  dateStringSchema,
  idParamSchema,
  museumIdParamSchema,
  paginationQuerySchema,
  positiveIntSchema,
  uuidSchema,
  type PaginationQuery,
} from '../lib/validation';
import { requireAuth } from '../middleware/auth';
import { getValidated, validate } from '../middleware/validate';
import {
  cancelTicketOrder,
  createTicketOrder,
  getTicketOrderById,
  listAdminMuseumTicketOrders,
  listUserTicketOrders,
  redeemTicketOrder,
} from '../services/ticket-orders';

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

const adminTicketOrdersQuerySchema = paginationQuerySchema.extend({
  visit_date: dateStringSchema.optional(),
  status: z.enum(['pending', 'confirmed', 'cancelled', 'used']).optional(),
});

type AdminTicketOrdersQuery = z.infer<typeof adminTicketOrdersQuerySchema>;

const redeemBodySchema = z
  .object({
    entry_code: z.string().trim().min(1, 'Entry code is required'),
  })
  .strict();

type RedeemBody = z.infer<typeof redeemBodySchema>;

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

ticketOrdersRouter.get(
  '/ticket-orders',
  requireAuth,
  validate({ query: paginationQuerySchema }),
  async (req, res) => {
    const { limit, offset } = getValidated<unknown, PaginationQuery>(req).query;
    const { orders, total } = await listUserTicketOrders(req.auth!.userId, limit, offset);
    sendPaginated(res, orders, { limit, offset, total });
  }
);

ticketOrdersRouter.get(
  '/ticket-orders/:id',
  requireAuth,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = getValidated<unknown, unknown, { id: string }>(req).params;
    const detail = await getTicketOrderById(req.auth!.userId, id);
    sendSuccess(res, detail);
  }
);

ticketOrdersRouter.post(
  '/ticket-orders/:id/cancel',
  requireAuth,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = getValidated<unknown, unknown, { id: string }>(req).params;
    const cancelled = await cancelTicketOrder(req.auth!.userId, id);
    sendSuccess(res, cancelled);
  }
);

ticketOrdersRouter.get(
  '/admin/museums/:museumId/ticket-orders',
  requireAuth,
  validate({ params: museumIdParamSchema, query: adminTicketOrdersQuerySchema }),
  async (req, res) => {
    const { museumId } = getValidated<unknown, unknown, { museumId: string }>(req).params;
    const { limit, offset, visit_date, status } = getValidated<unknown, AdminTicketOrdersQuery>(req).query;
    const { orders, total } = await listAdminMuseumTicketOrders(
      req.auth!.userId,
      museumId,
      { limit, offset, visit_date, status }
    );
    sendPaginated(res, orders, { limit, offset, total });
  }
);

ticketOrdersRouter.post(
  '/admin/ticket-orders/redeem',
  requireAuth,
  validate({ body: redeemBodySchema }),
  async (req, res) => {
    const { body } = getValidated<RedeemBody>(req);
    const result = await redeemTicketOrder(req.auth!.userId, body.entry_code);
    sendSuccess(res, result);
  }
);

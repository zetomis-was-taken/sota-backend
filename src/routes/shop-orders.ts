import { Router } from 'express';
import { z } from 'zod';
import { sendCreated, sendPaginated, sendSuccess } from '../lib/response';
import {
  idParamSchema,
  museumIdParamSchema,
  paginationQuerySchema,
  uuidSchema,
  type PaginationQuery,
} from '../lib/validation';
import { requireAuth } from '../middleware/auth';
import { getValidated, validate } from '../middleware/validate';
import {
  cancelShopOrder,
  checkoutCart,
  getShopOrderById,
  listAdminMuseumShopOrders,
  listUserShopOrders,
  updateShopOrderFulfillment,
} from '../services/shop-orders';

export const shopOrdersRouter = Router();

const checkoutParamsSchema = z
  .object({
    cartId: uuidSchema,
  })
  .strict();

const checkoutBodySchema = z
  .object({
    shipping_name: z.string().trim().min(1, 'shipping_name is required'),
    shipping_phone: z.string().trim().min(1, 'shipping_phone is required'),
    shipping_address: z.string().trim().min(1, 'shipping_address is required'),
    shipping_city: z.string().trim().min(1).optional().nullable(),
  })
  .strict();

type CheckoutParams = z.infer<typeof checkoutParamsSchema>;
type CheckoutBody = z.infer<typeof checkoutBodySchema>;

const adminShopOrdersQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(['pending', 'confirmed', 'shipped', 'completed', 'cancelled'])
    .optional(),
});

type AdminShopOrdersQuery = z.infer<typeof adminShopOrdersQuerySchema>;

const fulfillmentBodySchema = z
  .object({
    status: z.enum(['shipped', 'completed']),
  })
  .strict();

type FulfillmentBody = z.infer<typeof fulfillmentBodySchema>;

shopOrdersRouter.post(
  '/carts/:cartId/checkout',
  requireAuth,
  validate({ params: checkoutParamsSchema, body: checkoutBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<CheckoutBody, unknown, CheckoutParams>(req);
    const result = await checkoutCart({
      cartId: params.cartId,
      userId: req.auth!.userId,
      userEmail: req.auth!.email ?? null,
      shipping_name: body.shipping_name,
      shipping_phone: body.shipping_phone,
      shipping_address: body.shipping_address,
      shipping_city: body.shipping_city,
    });
    sendCreated(res, result);
  }
);

shopOrdersRouter.get(
  '/shop-orders',
  requireAuth,
  validate({ query: paginationQuerySchema }),
  async (req, res) => {
    const { limit, offset } = getValidated<unknown, PaginationQuery>(req).query;
    const { orders, total } = await listUserShopOrders(
      req.auth!.userId,
      limit,
      offset
    );
    sendPaginated(res, orders, { limit, offset, total });
  }
);

shopOrdersRouter.get(
  '/shop-orders/:id',
  requireAuth,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = getValidated<unknown, unknown, { id: string }>(req).params;
    const detail = await getShopOrderById(req.auth!.userId, id);
    sendSuccess(res, detail);
  }
);

shopOrdersRouter.post(
  '/shop-orders/:id/cancel',
  requireAuth,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = getValidated<unknown, unknown, { id: string }>(req).params;
    const cancelled = await cancelShopOrder(req.auth!.userId, id);
    sendSuccess(res, cancelled);
  }
);

shopOrdersRouter.get(
  '/admin/museums/:museumId/shop-orders',
  requireAuth,
  validate({ params: museumIdParamSchema, query: adminShopOrdersQuerySchema }),
  async (req, res) => {
    const { museumId } = getValidated<unknown, unknown, { museumId: string }>(
      req
    ).params;
    const { limit, offset, status } = getValidated<
      unknown,
      AdminShopOrdersQuery
    >(req).query;
    const { orders, total } = await listAdminMuseumShopOrders(
      req.auth!.userId,
      museumId,
      { limit, offset, status }
    );
    sendPaginated(res, orders, { limit, offset, total });
  }
);

shopOrdersRouter.patch(
  '/admin/shop-orders/:id/fulfillment',
  requireAuth,
  validate({ params: idParamSchema, body: fulfillmentBodySchema }),
  async (req, res) => {
    const { id } = getValidated<FulfillmentBody, unknown, { id: string }>(
      req
    ).params;
    const { body } = getValidated<FulfillmentBody>(req);
    const updated = await updateShopOrderFulfillment(
      req.auth!.userId,
      id,
      body.status
    );
    sendSuccess(res, updated);
  }
);

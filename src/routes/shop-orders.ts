import { Router } from 'express';
import { z } from 'zod';
import { sendCreated } from '../lib/response';
import { uuidSchema } from '../lib/validation';
import { requireAuth } from '../middleware/auth';
import { getValidated, validate } from '../middleware/validate';
import { checkoutCart } from '../services/shop-orders';

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

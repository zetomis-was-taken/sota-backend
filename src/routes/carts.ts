import { Router } from 'express';
import { z } from 'zod';
import { sendCreated, sendSuccess } from '../lib/response';
import { idParamSchema, positiveIntSchema, uuidSchema } from '../lib/validation';
import { requireAuth } from '../middleware/auth';
import { getValidated, validate } from '../middleware/validate';
import {
  addItemToCart,
  createCart,
  deleteCart,
  deleteCartItem,
  getUserActiveCarts,
  updateCartItem,
  updateCartStatus,
} from '../services/carts';

export const cartsRouter = Router();

const createCartBodySchema = z
  .object({
    museum_id: uuidSchema,
  })
  .strict();

type CreateCartBody = z.infer<typeof createCartBodySchema>;

const patchCartBodySchema = z
  .object({
    status: z.literal('abandoned'),
  })
  .strict();

type PatchCartBody = z.infer<typeof patchCartBodySchema>;

const cartIdParamsSchema = z
  .object({
    cartId: uuidSchema,
  })
  .strict();

type CartIdParams = z.infer<typeof cartIdParamsSchema>;

const createCartItemBodySchema = z
  .object({
    product_id: uuidSchema,
    quantity: positiveIntSchema,
  })
  .strict();

type CreateCartItemBody = z.infer<typeof createCartItemBodySchema>;

const cartItemParamsSchema = z
  .object({
    cartId: uuidSchema,
    itemId: uuidSchema,
  })
  .strict();

type CartItemParams = z.infer<typeof cartItemParamsSchema>;

const patchCartItemBodySchema = z
  .object({
    quantity: positiveIntSchema,
  })
  .strict();

type PatchCartItemBody = z.infer<typeof patchCartItemBodySchema>;

cartsRouter.get('/carts', requireAuth, async (req, res) => {
  const cartsList = await getUserActiveCarts(req.auth!.userId);
  sendSuccess(res, cartsList);
});

cartsRouter.post(
  '/carts',
  requireAuth,
  validate({ body: createCartBodySchema }),
  async (req, res) => {
    const { body } = getValidated<CreateCartBody>(req);
    const cart = await createCart(req.auth!.userId, body.museum_id);
    sendCreated(res, cart);
  }
);

cartsRouter.patch(
  '/carts/:id',
  requireAuth,
  validate({ params: idParamSchema, body: patchCartBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      PatchCartBody,
      unknown,
      z.infer<typeof idParamSchema>
    >(req);
    const cart = await updateCartStatus(
      req.auth!.userId,
      params.id,
      body.status
    );
    sendSuccess(res, cart);
  }
);

cartsRouter.delete(
  '/carts/:id',
  requireAuth,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { params } = getValidated<
      unknown,
      unknown,
      z.infer<typeof idParamSchema>
    >(req);
    const result = await deleteCart(req.auth!.userId, params.id);
    sendSuccess(res, result);
  }
);

cartsRouter.post(
  '/carts/:cartId/items',
  requireAuth,
  validate({ params: cartIdParamsSchema, body: createCartItemBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      CreateCartItemBody,
      unknown,
      CartIdParams
    >(req);
    const item = await addItemToCart(
      req.auth!.userId,
      params.cartId,
      body.product_id,
      body.quantity
    );
    sendCreated(res, item);
  }
);

cartsRouter.patch(
  '/carts/:cartId/items/:itemId',
  requireAuth,
  validate({ params: cartItemParamsSchema, body: patchCartItemBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      PatchCartItemBody,
      unknown,
      CartItemParams
    >(req);
    const item = await updateCartItem(
      req.auth!.userId,
      params.cartId,
      params.itemId,
      body.quantity
    );
    sendSuccess(res, item);
  }
);

cartsRouter.delete(
  '/carts/:cartId/items/:itemId',
  requireAuth,
  validate({ params: cartItemParamsSchema }),
  async (req, res) => {
    const { params } = getValidated<
      unknown,
      unknown,
      CartItemParams
    >(req);
    const result = await deleteCartItem(
      req.auth!.userId,
      params.cartId,
      params.itemId
    );
    sendSuccess(res, result);
  }
);

import { Router } from 'express';
import { cartsRouter } from './carts';
import { catalogRouter } from './catalog';
import { meRouter } from './me';
import { mediaRouter } from './media';
import { shopOrdersRouter } from './shop-orders';
import { ticketOrdersRouter } from './ticket-orders';

/** Base `/api/v1` router where domain feature routers are mounted. */
export const apiV1Router = Router();

apiV1Router.use(meRouter);
apiV1Router.use(catalogRouter);
apiV1Router.use(mediaRouter);
apiV1Router.use(ticketOrdersRouter);
apiV1Router.use(shopOrdersRouter);
apiV1Router.use(cartsRouter);

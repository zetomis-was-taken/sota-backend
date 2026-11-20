import { Router } from 'express';
import { catalogRouter } from './catalog';
import { meRouter } from './me';
import { ticketOrdersRouter } from './ticket-orders';

/** Base `/api/v1` router where domain feature routers are mounted. */
export const apiV1Router = Router();

apiV1Router.use(meRouter);
apiV1Router.use(catalogRouter);
apiV1Router.use(ticketOrdersRouter);


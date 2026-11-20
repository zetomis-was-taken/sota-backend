import { Router } from 'express';
import { catalogRouter } from './catalog';
import { meRouter } from './me';

/** Base `/api/v1` router where domain feature routers are mounted. */
export const apiV1Router = Router();

apiV1Router.use(meRouter);
apiV1Router.use(catalogRouter);


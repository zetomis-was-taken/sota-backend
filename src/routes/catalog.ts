import { Router } from 'express';
import { z } from 'zod';
import { sendPaginated, sendSuccess } from '../lib/response';
import { paginationQuerySchema, type PaginationQuery } from '../lib/validation';
import { getValidated, validate } from '../middleware/validate';
import {
  getPublicMuseumBySlug,
  listPublicMuseums,
} from '../services/catalog';

export const catalogRouter = Router();

const slugParamSchema = z.object({
  slug: z.string().trim().min(1, 'Slug is required'),
});

type SlugParam = z.infer<typeof slugParamSchema>;

catalogRouter.get(
  '/museums',
  validate({ query: paginationQuerySchema }),
  async (req, res) => {
    const { limit, offset } = getValidated<unknown, PaginationQuery>(req).query;
    const { museums, total } = await listPublicMuseums(limit, offset);
    sendPaginated(res, museums, { limit, offset, total });
  }
);

catalogRouter.get(
  '/museums/:slug',
  validate({ params: slugParamSchema }),
  async (req, res) => {
    const { slug } = getValidated<unknown, unknown, SlugParam>(req).params;
    const museum = await getPublicMuseumBySlug(slug);
    sendSuccess(res, museum);
  }
);

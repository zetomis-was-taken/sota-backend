import { Router } from 'express';
import { z } from 'zod';
import { sendPaginated, sendSuccess } from '../lib/response';
import {
  idParamSchema,
  museumIdParamSchema,
  paginationQuerySchema,
  type PaginationQuery,
} from '../lib/validation';
import { getValidated, validate } from '../middleware/validate';
import {
  getPublicArtifactById,
  getPublicMuseumBySlug,
  listPublicMuseumArtifacts,
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

catalogRouter.get(
  '/museums/:museumId/artifacts',
  validate({ params: museumIdParamSchema, query: paginationQuerySchema }),
  async (req, res) => {
    const { params, query } = getValidated<
      unknown,
      PaginationQuery,
      z.infer<typeof museumIdParamSchema>
    >(req);
    const { artifacts, total } = await listPublicMuseumArtifacts(
      params.museumId,
      query.limit,
      query.offset
    );
    sendPaginated(res, artifacts, {
      limit: query.limit,
      offset: query.offset,
      total,
    });
  }
);

catalogRouter.get(
  '/artifacts/:id',
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = getValidated<
      unknown,
      unknown,
      z.infer<typeof idParamSchema>
    >(req).params;
    const artifact = await getPublicArtifactById(id);
    sendSuccess(res, artifact);
  }
);


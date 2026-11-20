import { Router } from 'express';
import { z } from 'zod';
import { sendCreated, sendPaginated, sendSuccess } from '../lib/response';
import {
  createMuseumBodySchema,
  idParamSchema,
  mediaQuerySchema,
  museumIdParamSchema,
  paginationQuerySchema,
  patchMuseumBodySchema,
  type CreateMuseumBody,
  type MediaQuery,
  type PaginationQuery,
  type PatchMuseumBody,
} from '../lib/validation';
import { requireAuth, requireSuperAdmin } from '../middleware/auth';
import { getValidated, validate } from '../middleware/validate';
import {
  createAdminMuseum,
  getPublicArtifactById,
  getPublicMuseumBySlug,
  listAdminMuseums,
  listPublicMedia,
  listPublicMuseumArtifacts,
  listPublicMuseums,
  updateAdminMuseum,
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

catalogRouter.get(
  '/media',
  validate({ query: mediaQuerySchema }),
  async (req, res) => {
    const { query } = getValidated<unknown, MediaQuery>(req);
    const { media, total } = await listPublicMedia(
      query.entity_type,
      query.entity_id,
      query.limit,
      query.offset
    );
    sendPaginated(res, media, {
      limit: query.limit,
      offset: query.offset,
      total,
    });
  }
);

catalogRouter.get(
  '/admin/museums',
  requireAuth,
  validate({ query: paginationQuerySchema }),
  async (req, res) => {
    const { limit, offset } = getValidated<unknown, PaginationQuery>(req).query;
    const { museums, total } = await listAdminMuseums(
      req.auth!.userId,
      limit,
      offset
    );
    sendPaginated(res, museums, { limit, offset, total });
  }
);

catalogRouter.post(
  '/admin/museums',
  requireAuth,
  requireSuperAdmin,
  validate({ body: createMuseumBodySchema }),
  async (req, res) => {
    const { body } = getValidated<CreateMuseumBody>(req);
    const museum = await createAdminMuseum(req.auth!.userId, body);
    sendCreated(res, museum);
  }
);

catalogRouter.patch(
  '/admin/museums/:id',
  requireAuth,
  validate({ params: idParamSchema, body: patchMuseumBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      PatchMuseumBody,
      unknown,
      z.infer<typeof idParamSchema>
    >(req);
    const museum = await updateAdminMuseum(req.auth!.userId, params.id, body);
    sendSuccess(res, museum);
  }
);




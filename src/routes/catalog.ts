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
import { requireAuth, requireSuperAdmin } from '../middleware/auth';
import { getValidated, validate } from '../middleware/validate';
import {
  createAdminMuseum,
  createAdminMuseumArtifact,
  getPublicArtifactById,
  getPublicMuseumBySlug,
  listAdminMuseumArtifacts,
  listAdminMuseums,
  listPublicMedia,
  listPublicMuseumArtifacts,
  listPublicMuseums,
  updateAdminArtifact,
  updateAdminMuseum,
} from '../services/catalog';

export const catalogRouter = Router();

export const mediaQuerySchema = paginationQuerySchema.extend({
  entity_type: z.enum(['artifact', 'souvenir']),
  entity_id: uuidSchema,
});

export type MediaQuery = z.infer<typeof mediaQuerySchema>;

export const createMuseumBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    slug: z.string().trim().min(1, 'Slug is required'),
    description: z.string().trim().nullable().optional(),
    address: z.string().trim().nullable().optional(),
    city: z.string().trim().nullable().optional(),
    cover_image_path: z.string().trim().nullable().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
  })
  .strict();

export type CreateMuseumBody = z.infer<typeof createMuseumBodySchema>;

export const patchMuseumBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').optional(),
    slug: z.string().trim().min(1, 'Slug cannot be empty').optional(),
    description: z.string().trim().nullable().optional(),
    address: z.string().trim().nullable().optional(),
    city: z.string().trim().nullable().optional(),
    cover_image_path: z.string().trim().nullable().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided to update'
  );

export type PatchMuseumBody = z.infer<typeof patchMuseumBodySchema>;

export const createArtifactBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    description: z.string().trim().nullable().optional(),
    period: z.string().trim().nullable().optional(),
    inventory_code: z.string().trim().nullable().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
  })
  .strict();

export type CreateArtifactBody = z.infer<typeof createArtifactBodySchema>;

export const patchArtifactBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Name cannot be empty').optional(),
    description: z.string().trim().nullable().optional(),
    period: z.string().trim().nullable().optional(),
    inventory_code: z.string().trim().nullable().optional(),
    status: z.enum(['draft', 'published', 'archived']).optional(),
  })
  .strict()
  .refine(
    (data) => Object.keys(data).length > 0,
    'At least one field must be provided to update'
  );

export type PatchArtifactBody = z.infer<typeof patchArtifactBodySchema>;

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

catalogRouter.get(
  '/admin/museums/:museumId/artifacts',
  requireAuth,
  validate({ params: museumIdParamSchema, query: paginationQuerySchema }),
  async (req, res) => {
    const { params, query } = getValidated<
      unknown,
      PaginationQuery,
      z.infer<typeof museumIdParamSchema>
    >(req);
    const { artifacts, total } = await listAdminMuseumArtifacts(
      req.auth!.userId,
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

catalogRouter.post(
  '/admin/museums/:museumId/artifacts',
  requireAuth,
  validate({ params: museumIdParamSchema, body: createArtifactBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      CreateArtifactBody,
      unknown,
      z.infer<typeof museumIdParamSchema>
    >(req);
    const artifact = await createAdminMuseumArtifact(
      req.auth!.userId,
      params.museumId,
      body
    );
    sendCreated(res, artifact);
  }
);

catalogRouter.patch(
  '/admin/artifacts/:id',
  requireAuth,
  validate({ params: idParamSchema, body: patchArtifactBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      PatchArtifactBody,
      unknown,
      z.infer<typeof idParamSchema>
    >(req);
    const artifact = await updateAdminArtifact(
      req.auth!.userId,
      params.id,
      body
    );
    sendSuccess(res, artifact);
  }
);





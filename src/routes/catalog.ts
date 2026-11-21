import { Router } from 'express';
import { z } from 'zod';
import { sendCreated, sendPaginated, sendSuccess } from '../lib/response';
import {
  createArtifactBodySchema,
  createMuseumBodySchema,
  createProductBodySchema,
  createTicketTypeBodySchema,
  idParamSchema,
  mediaQuerySchema,
  museumIdParamSchema,
  paginationQuerySchema,
  patchArtifactBodySchema,
  patchMuseumBodySchema,
  patchProductBodySchema,
  patchTicketTypeBodySchema,
  type CreateArtifactBody,
  type CreateMuseumBody,
  type CreateProductBody,
  type CreateTicketTypeBody,
  type MediaQuery,
  type PaginationQuery,
  type PatchArtifactBody,
  type PatchMuseumBody,
  type PatchProductBody,
  type PatchTicketTypeBody,
} from '../lib/validation';
import { requireAuth, requireSuperAdmin } from '../middleware/auth';
import { getValidated, validate } from '../middleware/validate';
import {
  createAdminMuseum,
  createAdminMuseumArtifact,
  createAdminMuseumProduct,
  createAdminMuseumTicketType,
  getPublicArtifactById,
  getPublicMuseumBySlug,
  getPublicProductById,
  listAdminMuseumArtifacts,
  listAdminMuseumProducts,
  listAdminMuseumTicketTypes,
  listAdminMuseums,
  listPublicMedia,
  listPublicMuseumArtifacts,
  listPublicMuseumProducts,
  listPublicMuseumTicketTypes,
  listPublicMuseums,
  updateAdminArtifact,
  updateAdminMuseum,
  updateAdminProduct,
  updateAdminTicketType,
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

catalogRouter.get(
  '/museums/:museumId/products',
  validate({ params: museumIdParamSchema, query: paginationQuerySchema }),
  async (req, res) => {
    const { params, query } = getValidated<
      unknown,
      PaginationQuery,
      z.infer<typeof museumIdParamSchema>
    >(req);
    const { products, total } = await listPublicMuseumProducts(
      params.museumId,
      query.limit,
      query.offset
    );
    sendPaginated(res, products, {
      limit: query.limit,
      offset: query.offset,
      total,
    });
  }
);

catalogRouter.get(
  '/products/:id',
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { id } = getValidated<
      unknown,
      unknown,
      z.infer<typeof idParamSchema>
    >(req).params;
    const product = await getPublicProductById(id);
    sendSuccess(res, product);
  }
);

catalogRouter.get(
  '/museums/:museumId/ticket-types',
  validate({ params: museumIdParamSchema, query: paginationQuerySchema }),
  async (req, res) => {
    const { params, query } = getValidated<
      unknown,
      PaginationQuery,
      z.infer<typeof museumIdParamSchema>
    >(req);
    const { ticket_types, total } = await listPublicMuseumTicketTypes(
      params.museumId,
      query.limit,
      query.offset
    );
    sendPaginated(res, ticket_types, {
      limit: query.limit,
      offset: query.offset,
      total,
    });
  }
);

catalogRouter.get(
  '/admin/museums/:museumId/products',
  requireAuth,
  validate({ params: museumIdParamSchema, query: paginationQuerySchema }),
  async (req, res) => {
    const { params, query } = getValidated<
      unknown,
      PaginationQuery,
      z.infer<typeof museumIdParamSchema>
    >(req);
    const { products, total } = await listAdminMuseumProducts(
      req.auth!.userId,
      params.museumId,
      query.limit,
      query.offset
    );
    sendPaginated(res, products, {
      limit: query.limit,
      offset: query.offset,
      total,
    });
  }
);

catalogRouter.post(
  '/admin/museums/:museumId/products',
  requireAuth,
  validate({ params: museumIdParamSchema, body: createProductBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      CreateProductBody,
      unknown,
      z.infer<typeof museumIdParamSchema>
    >(req);
    const product = await createAdminMuseumProduct(
      req.auth!.userId,
      params.museumId,
      body
    );
    sendCreated(res, product);
  }
);

catalogRouter.patch(
  '/admin/products/:id',
  requireAuth,
  validate({ params: idParamSchema, body: patchProductBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      PatchProductBody,
      unknown,
      z.infer<typeof idParamSchema>
    >(req);
    const product = await updateAdminProduct(
      req.auth!.userId,
      params.id,
      body
    );
    sendSuccess(res, product);
  }
);

catalogRouter.get(
  '/admin/museums/:museumId/ticket-types',
  requireAuth,
  validate({ params: museumIdParamSchema, query: paginationQuerySchema }),
  async (req, res) => {
    const { params, query } = getValidated<
      unknown,
      PaginationQuery,
      z.infer<typeof museumIdParamSchema>
    >(req);
    const { ticket_types, total } = await listAdminMuseumTicketTypes(
      req.auth!.userId,
      params.museumId,
      query.limit,
      query.offset
    );
    sendPaginated(res, ticket_types, {
      limit: query.limit,
      offset: query.offset,
      total,
    });
  }
);

catalogRouter.post(
  '/admin/museums/:museumId/ticket-types',
  requireAuth,
  validate({ params: museumIdParamSchema, body: createTicketTypeBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      CreateTicketTypeBody,
      unknown,
      z.infer<typeof museumIdParamSchema>
    >(req);
    const ticketType = await createAdminMuseumTicketType(
      req.auth!.userId,
      params.museumId,
      body
    );
    sendCreated(res, ticketType);
  }
);

catalogRouter.patch(
  '/admin/ticket-types/:id',
  requireAuth,
  validate({ params: idParamSchema, body: patchTicketTypeBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      PatchTicketTypeBody,
      unknown,
      z.infer<typeof idParamSchema>
    >(req);
    const ticketType = await updateAdminTicketType(
      req.auth!.userId,
      params.id,
      body
    );
    sendSuccess(res, ticketType);
  }
);






import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { BadRequestError } from '../lib/errors';
import { sendCreated, sendSuccess } from '../lib/response';
import { idParamSchema, uuidSchema } from '../lib/validation';
import { requireAuth } from '../middleware/auth';
import { getValidated, validate } from '../middleware/validate';
import {
  createAdminMedia,
  deleteAdminMedia,
  updateAdminMedia,
} from '../services/media';

export const mediaRouter = Router();

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

export const createMediaBodySchema = z
  .object({
    museum_id: uuidSchema,
    entity_type: z.enum(['artifact', 'souvenir']),
    entity_id: uuidSchema,
    media_type: z.enum(['image', 'video']),
    sort_order: z
      .preprocess((val) => {
        if (val === undefined) return undefined;
        if (val === null || val === '') return null;
        if (typeof val === 'number') return val;
        if (typeof val === 'string') {
          const trimmed = val.trim();
          if (trimmed === '') return null;
          const parsed = Number(trimmed);
          return Number.isInteger(parsed) ? parsed : val;
        }
        return val;
      }, z.number().int('sort_order must be an integer').min(0, 'sort_order must be >= 0').optional())
      .default(0),
    is_primary: z
      .preprocess((val) => {
        if (val === undefined) return undefined;
        if (val === 'true' || val === true) return true;
        if (val === 'false' || val === false) return false;
        return val;
      }, z.boolean({ message: 'is_primary must be a boolean' }).optional())
      .default(false),
  })
  .strict();

export const patchMediaBodySchema = z
  .object({
    sort_order: z.preprocess((val) => {
      if (val === undefined) return undefined;
      if (val === null || val === '') return null;
      if (typeof val === 'number') return val;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed === '') return null;
        const parsed = Number(trimmed);
        return Number.isInteger(parsed) ? parsed : val;
      }
      return val;
    }, z.number().int('sort_order must be an integer').min(0, 'sort_order must be >= 0').optional()),
    is_primary: z.preprocess((val) => {
      if (val === undefined) return undefined;
      if (val === 'true' || val === true) return true;
      if (val === 'false' || val === false) return false;
      return val;
    }, z.boolean({ message: 'is_primary must be a boolean' }).optional()),
  })
  .strict()
  .refine(
    (data) => data.sort_order !== undefined || data.is_primary !== undefined,
    'At least one field must be provided to update'
  );

mediaRouter.post(
  '/admin/media',
  requireAuth,
  upload.single('file'),
  validate({ body: createMediaBodySchema }),
  async (req, res) => {
    if (!req.file) {
      throw new BadRequestError('File is required', 'file_required');
    }

    const { body } = getValidated<z.infer<typeof createMediaBodySchema>>(req);

    const asset = await createAdminMedia({
      userId: req.auth!.userId,
      museumId: body.museum_id,
      entityType: body.entity_type,
      entityId: body.entity_id,
      mediaType: body.media_type,
      file: req.file,
      sortOrder: body.sort_order,
      isPrimary: body.is_primary,
    });

    sendCreated(res, asset);
  }
);

mediaRouter.patch(
  '/admin/media/:id',
  requireAuth,
  validate({ params: idParamSchema, body: patchMediaBodySchema }),
  async (req, res) => {
    const { params, body } = getValidated<
      z.infer<typeof patchMediaBodySchema>,
      unknown,
      z.infer<typeof idParamSchema>
    >(req);

    const asset = await updateAdminMedia(req.auth!.userId, params.id, body);
    sendSuccess(res, asset);
  }
);

mediaRouter.delete(
  '/admin/media/:id',
  requireAuth,
  validate({ params: idParamSchema }),
  async (req, res) => {
    const { params } = getValidated<
      unknown,
      unknown,
      z.infer<typeof idParamSchema>
    >(req);

    const result = await deleteAdminMedia(req.auth!.userId, params.id);
    sendSuccess(res, result);
  }
);

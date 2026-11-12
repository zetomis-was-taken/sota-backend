import { pgEnum } from 'drizzle-orm/pg-core';

export const appRoleEnum = pgEnum('app_role', [
  'normal_user',
  'admin_user',
  'super_admin',
]);

export const publicationStatusEnum = pgEnum('publication_status', [
  'draft',
  'published',
  'archived',
]);

export const mediaTypeEnum = pgEnum('media_type', ['image', 'video']);

export const mediaEntityTypeEnum = pgEnum('media_entity_type', [
  'artifact',
  'souvenir',
]);

export const ticketOrderStatusEnum = pgEnum('ticket_order_status', [
  'pending',
  'confirmed',
  'used',
  'cancelled',
]);

export const paymentStatusEnum = pgEnum('payment_status', [
  'unpaid',
  'paid',
  'failed',
]);

export const cartStatusEnum = pgEnum('cart_status', [
  'active',
  'converted',
  'abandoned',
]);

export const shopOrderStatusEnum = pgEnum('shop_order_status', [
  'pending',
  'confirmed',
  'shipped',
  'completed',
  'cancelled',
]);

export const adminMembershipStatusEnum = pgEnum('admin_membership_status', [
  'active',
  'suspended',
  'revoked',
]);

import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import postgres, { type Sql } from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { env } from '../src/config/env';

const ROLLBACK_SENTINEL = '__VERIFY_DB_ROLLBACK__';

async function asRole(
  tx: Sql,
  role: 'anon' | 'authenticated',
  userId: string | null,
  fn: () => Promise<void>
) {
  await tx.unsafe(`SET LOCAL ROLE ${role}`);
  if (userId) {
    const claims = JSON.stringify({ sub: userId, role: 'authenticated' });
    await tx`SELECT set_config('request.jwt.claims', ${claims}, true)`;
    await tx`SELECT set_config('request.jwt.claim.sub', ${userId}, true)`;
  } else {
    await tx`SELECT set_config('request.jwt.claims', '', true)`;
    await tx`SELECT set_config('request.jwt.claim.sub', '', true)`;
  }
  try {
    await fn();
  } finally {
    await tx.unsafe('RESET ROLE');
    await tx`SELECT set_config('request.jwt.claims', '', true)`;
    await tx`SELECT set_config('request.jwt.claim.sub', '', true)`;
  }
}

async function expectError(
  tx: Sql,
  fn: (sp: Sql) => Promise<unknown>,
  expectedSubstring: string,
  label: string
) {
  let caught: unknown;
  try {
    await tx.savepoint(async (sp) => {
      await fn(sp);
    });
  } catch (err: unknown) {
    caught = err;
  }
  assert.ok(
    caught !== undefined,
    `Expected error (${expectedSubstring}) for: ${label}`
  );
  const msg = caught instanceof Error ? caught.message : String(caught);
  assert.ok(
    msg.includes(expectedSubstring),
    `${label}: expected "${expectedSubstring}", got "${msg}"`
  );
}

async function verifyHttpSurface() {
  assert.ok(env.supabaseUrl, 'SUPABASE_URL must be set');
  assert.ok(env.supabasePublishableKey, 'SUPABASE_PUBLISHABLE_KEY must be set');

  const supabase = createClient(env.supabaseUrl, env.supabasePublishableKey);

  const pubMuseums = await supabase.from('museums').select('id').limit(1);
  assert.equal(
    pubMuseums.error,
    null,
    `Anon SELECT on museums failed: ${pubMuseums.error?.message}`
  );

  const anonOrders = await supabase.from('ticket_orders').select('id').limit(1);
  assert.ok(
    anonOrders.error !== null,
    'Anon SELECT on ticket_orders must be denied'
  );

  const anonRpc = await supabase.rpc('redeem_entry', {
    p_entry_code: 'ENT-NONEXISTENT',
  });
  assert.ok(anonRpc.error !== null, 'Anon RPC redeem_entry must be denied');

  console.log('✓ HTTP PostgREST anon surface verified');
}

async function verifyDatabaseSecurityAndRpcs() {
  const databaseUrl = process.env.DATABASE_URL;
  assert.ok(databaseUrl, 'DATABASE_URL must be set');

  const sql = postgres(databaseUrl, { prepare: false });

  const superAdminId = randomUUID();
  const adminUserId = randomUUID();
  const normalUserId = randomUUID();
  const otherUserId = randomUUID();

  try {
    await sql.begin(async (tx) => {
      // 1. Insert synthetic auth.users to trigger handle_new_auth_user()
      for (const [id, email, name] of [
        [superAdminId, `super-${superAdminId}@example.test`, 'Super Admin'],
        [adminUserId, `admin-${adminUserId}@example.test`, 'Museum Admin'],
        [normalUserId, `user-${normalUserId}@example.test`, 'Normal User'],
        [otherUserId, `other-${otherUserId}@example.test`, 'Other User'],
      ]) {
        await tx`
          INSERT INTO auth.users (id, email, raw_user_meta_data)
          VALUES (${id}::uuid, ${email}, ${sql.json({ display_name: name })})
        `;
      }

      const createdRoles = await tx`
        SELECT user_id, role FROM public.user_roles
        WHERE user_id = ANY(${[superAdminId, adminUserId, normalUserId, otherUserId]}::uuid[])
      `;
      assert.equal(createdRoles.length, 4);
      assert.ok(createdRoles.every((r) => r.role === 'normal_user'));

      // Provision super_admin & admin_user roles via SQL
      await tx`
        INSERT INTO public.user_roles (user_id, role)
        VALUES
          (${superAdminId}::uuid, 'super_admin'::public.app_role),
          (${adminUserId}::uuid, 'admin_user'::public.app_role)
      `;
      console.log('✓ Signup trigger & role provisioning verified');

      // 2. Super admin creates published museumA and draft museumB
      let museumAId = '';
      let museumBId = '';

      await asRole(tx, 'authenticated', superAdminId, async () => {
        const [mA] = await tx`
          INSERT INTO public.museums (name, slug, status, created_by)
          VALUES ('Museum A', ${'museum-a-' + superAdminId}, 'published', ${superAdminId}::uuid)
          RETURNING id
        `;
        const [mB] = await tx`
          INSERT INTO public.museums (name, slug, status, created_by)
          VALUES ('Museum B Draft', ${'museum-b-' + superAdminId}, 'draft', ${superAdminId}::uuid)
          RETURNING id
        `;
        museumAId = mA.id;
        museumBId = mB.id;
      });

      // Assign adminUser to museumA (active)
      await tx`
        INSERT INTO public.museum_admins (museum_id, user_id, status, assigned_by)
        VALUES (${museumAId}::uuid, ${adminUserId}::uuid, 'active', ${superAdminId}::uuid)
      `;

      // Super admin seeds published artifact inside draft museumB (must stay hidden from anon/normal_user!)
      let draftMuseumArtifactId = '';
      let museumBProductId = '';
      await asRole(tx, 'authenticated', superAdminId, async () => {
        const [artB] = await tx`
          INSERT INTO public.artifacts (museum_id, name, status, created_by)
          VALUES (${museumBId}::uuid, 'Hidden Published Artifact', 'published', ${superAdminId}::uuid)
          RETURNING id
        `;
        draftMuseumArtifactId = artB.id;

        const [prodB] = await tx`
          INSERT INTO public.souvenir_products (museum_id, name, price, stock_quantity, status, created_by)
          VALUES (${museumBId}::uuid, 'Museum B Mug', 50000, 5, 'published', ${superAdminId}::uuid)
          RETURNING id
        `;
        museumBProductId = prodB.id;
      });

      // AdminUser populates museumA catalog + media
      let museumAArtifactPubId = '';
      let museumAArtifactDraftId = '';
      let museumAProductId = '';
      let museumATicketId = '';
      let museumATicketUnavailId = '';

      await asRole(tx, 'authenticated', adminUserId, async () => {
        await expectError(
          tx,
          (sp) =>
            sp`INSERT INTO public.museums (name, slug, created_by) VALUES ('Hack', ${'hack-' + adminUserId}, ${adminUserId}::uuid)`,
          'row-level security',
          'admin_user cannot create museum'
        );

        await expectError(
          tx,
          (sp) =>
            sp`INSERT INTO public.artifacts (museum_id, name, status, created_by) VALUES (${museumBId}::uuid, 'Cross', 'published', ${adminUserId}::uuid)`,
          'row-level security',
          'admin_user cannot insert into unmanaged museum'
        );

        const [aPub] = await tx`
          INSERT INTO public.artifacts (museum_id, name, status, created_by)
          VALUES (${museumAId}::uuid, 'Bronze Drum', 'published', ${adminUserId}::uuid)
          RETURNING id
        `;
        const [aDraft] = await tx`
          INSERT INTO public.artifacts (museum_id, name, status, created_by)
          VALUES (${museumAId}::uuid, 'Secret Scroll', 'draft', ${adminUserId}::uuid)
          RETURNING id
        `;
        museumAArtifactPubId = aPub.id;
        museumAArtifactDraftId = aDraft.id;

        const [pA] = await tx`
          INSERT INTO public.souvenir_products (museum_id, name, price, stock_quantity, status, created_by)
          VALUES (${museumAId}::uuid, 'Postcard Set', 25000, 3, 'published', ${adminUserId}::uuid)
          RETURNING id
        `;
        museumAProductId = pA.id;

        const [tAvail] = await tx`
          INSERT INTO public.ticket_types (museum_id, name, price, is_available)
          VALUES (${museumAId}::uuid, 'Adult', 40000, true)
          RETURNING id
        `;
        const [tUnavail] = await tx`
          INSERT INTO public.ticket_types (museum_id, name, price, is_available)
          VALUES (${museumAId}::uuid, 'VIP', 200000, false)
          RETURNING id
        `;
        museumATicketId = tAvail.id;
        museumATicketUnavailId = tUnavail.id;

        await tx`
          INSERT INTO public.media_assets (museum_id, entity_type, entity_id, media_type, storage_bucket, storage_path, mime_type, is_primary, created_by)
          VALUES
            (${museumAId}::uuid, 'artifact', ${museumAArtifactPubId}::uuid, 'image', 'museum-media', ${`${museumAId}/artifact/${museumAArtifactPubId}/a.jpg`}, 'image/jpeg', true, ${adminUserId}::uuid),
            (${museumAId}::uuid, 'artifact', ${museumAArtifactDraftId}::uuid, 'image', 'museum-media', ${`${museumAId}/artifact/${museumAArtifactDraftId}/b.jpg`}, 'image/jpeg', true, ${adminUserId}::uuid)
        `;

        await expectError(
          tx,
          (sp) =>
            sp`INSERT INTO public.media_assets (museum_id, entity_type, entity_id, media_type, storage_bucket, storage_path, mime_type, created_by)
               VALUES (${museumAId}::uuid, 'artifact', ${draftMuseumArtifactId}::uuid, 'image', 'museum-media', ${`${museumAId}/artifact/${draftMuseumArtifactId}/x.jpg`}, 'image/jpeg', ${adminUserId}::uuid)`,
          'media_entity_museum_mismatch',
          'media_assets cross-museum entity trigger'
        );

        await expectError(
          tx,
          (sp) => sp`DELETE FROM public.artifacts WHERE id = ${museumAArtifactDraftId}::uuid`,
          'permission denied',
          'catalog rows cannot be hard-deleted'
        );
      });

      // Verify anon visibility (including published artifact inside draft museumB = hidden!)
      await asRole(tx, 'anon', null, async () => {
        const museums = await tx`SELECT id FROM public.museums WHERE id = ANY(${[museumAId, museumBId]}::uuid[])`;
        assert.deepEqual(museums.map((m) => m.id), [museumAId]);

        const arts = await tx`SELECT id FROM public.artifacts WHERE id = ANY(${[museumAArtifactPubId, museumAArtifactDraftId, draftMuseumArtifactId]}::uuid[])`;
        assert.deepEqual(arts.map((a) => a.id), [museumAArtifactPubId]);

        const media = await tx`SELECT entity_id FROM public.media_assets WHERE museum_id = ${museumAId}::uuid`;
        assert.deepEqual(media.map((m) => m.entity_id), [museumAArtifactPubId]);

        const tickets = await tx`SELECT id FROM public.ticket_types WHERE museum_id = ${museumAId}::uuid`;
        assert.deepEqual(tickets.map((t) => t.id), [museumATicketId]);

        await expectError(
          tx,
          (sp) => sp`SELECT id FROM public.users LIMIT 1`,
          'permission denied',
          'anon cannot read public.users'
        );
      });
      console.log('✓ Catalog RLS & draft-museum isolation verified');

      // 3. Profile column grants + no client writes to user_roles/museum_admins
      await asRole(tx, 'authenticated', normalUserId, async () => {
        await tx`UPDATE public.users SET display_name = 'Updated Name', phone = '0901234567' WHERE id = ${normalUserId}::uuid`;

        await expectError(
          tx,
          (sp) => sp`UPDATE public.users SET updated_at = now() WHERE id = ${normalUserId}::uuid`,
          'permission denied',
          'cannot update non-granted users columns'
        );

        await expectError(
          tx,
          (sp) => sp`INSERT INTO public.user_roles (user_id, role) VALUES (${normalUserId}::uuid, 'super_admin')`,
          'permission denied',
          'cannot insert into user_roles'
        );

        await expectError(
          tx,
          (sp) => sp`INSERT INTO public.museum_admins (museum_id, user_id) VALUES (${museumAId}::uuid, ${normalUserId}::uuid)`,
          'permission denied',
          'cannot insert into museum_admins'
        );
      });
      console.log('✓ Profile column grants & role/membership write locks verified');

      // 4. Ticket purchase, redeem_entry, and cancel_ticket_order RPCs
      let todayOrderId = '';
      let futureOrderId = '';
      let entryCode = '';

      const [{ today, tomorrow, yesterday }] = await tx`
        SELECT
          (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date::text AS today,
          ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date + 1)::text AS tomorrow,
          ((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - 1)::text AS yesterday
      `;

      await asRole(tx, 'authenticated', normalUserId, async () => {
        await expectError(
          tx,
          (sp) =>
            sp`SELECT public.purchase_tickets(${museumAId}::uuid, ${yesterday}::date, '09:00-11:00', ${sql.json([{ ticket_type_id: museumATicketId, quantity: 1 }])})`,
          'invalid_visit_date',
          'past visit_date rejected'
        );

        await expectError(
          tx,
          (sp) =>
            sp`SELECT public.purchase_tickets(${museumAId}::uuid, ${today}::date, 'bad-slot', ${sql.json([{ ticket_type_id: museumATicketId, quantity: 1 }])})`,
          'invalid_time_slot',
          'invalid time_slot rejected'
        );

        await expectError(
          tx,
          (sp) =>
            sp`SELECT public.purchase_tickets(${museumAId}::uuid, ${today}::date, '09:00-11:00', ${sql.json([{ ticket_type_id: museumATicketUnavailId, quantity: 1 }])})`,
          'ticket_type_unavailable',
          'unavailable ticket_type rejected'
        );

        await expectError(
          tx,
          (sp) =>
            sp`SELECT public.purchase_tickets(${museumBId}::uuid, ${today}::date, '09:00-11:00', ${sql.json([{ ticket_type_id: museumATicketId, quantity: 1 }])})`,
          'museum_not_available',
          'draft museum rejected'
        );

        const [r1] = await tx`
          SELECT public.purchase_tickets(
            ${museumAId}::uuid,
            ${today}::date,
            '09:00-11:00',
            ${sql.json([{ ticket_type_id: museumATicketId, quantity: 2 }])}
          ) AS id
        `;
        todayOrderId = r1.id;

        const [r2] = await tx`
          SELECT public.purchase_tickets(
            ${museumAId}::uuid,
            ${tomorrow}::date,
            '11:00-13:00',
            ${sql.json([{ ticket_type_id: museumATicketId, quantity: 1 }])}
          ) AS id
        `;
        futureOrderId = r2.id;

        const [order] = await tx`
          SELECT status, payment_status, total_amount::text, entry_code
          FROM public.ticket_orders WHERE id = ${todayOrderId}::uuid
        `;
        assert.equal(order.status, 'confirmed');
        assert.equal(order.payment_status, 'paid');
        assert.equal(order.total_amount, '80000.00');
        assert.ok(order.entry_code);
        entryCode = order.entry_code;

        const [inv] = await tx`
          SELECT invoice_number, total_amount::text FROM public.ticket_invoices WHERE ticket_order_id = ${todayOrderId}::uuid
        `;
        assert.ok(inv.invoice_number.startsWith('TKT-'));
        assert.equal(inv.total_amount, '80000.00');

        await expectError(
          tx,
          (sp) => sp`UPDATE public.ticket_invoices SET total_amount = 0 WHERE ticket_order_id = ${todayOrderId}::uuid`,
          'permission denied',
          'invoices are immutable'
        );

        await expectError(
          tx,
          (sp) => sp`SELECT public.redeem_entry(${entryCode})`,
          'not_museum_admin',
          'normal_user cannot redeem_entry'
        );

        await expectError(
          tx,
          (sp) => sp`SELECT public.cancel_ticket_order(${todayOrderId}::uuid)`,
          'visit_date_passed',
          'cannot cancel ticket order on or after visit_date'
        );

        await tx`SELECT public.cancel_ticket_order(${futureOrderId}::uuid)`;
        const [cancelled] = await tx`SELECT status FROM public.ticket_orders WHERE id = ${futureOrderId}::uuid`;
        assert.equal(cancelled.status, 'cancelled');
      });

      await asRole(tx, 'authenticated', adminUserId, async () => {
        const [redeemed] = await tx`SELECT public.redeem_entry(${entryCode}) AS id`;
        assert.equal(redeemed.id, todayOrderId);

        await expectError(
          tx,
          (sp) => sp`SELECT public.redeem_entry(${entryCode})`,
          'already_used',
          'redeem_entry rejects re-use'
        );
      });
      console.log('✓ Ticket purchase, redeem_entry, and cancel_ticket_order verified');

      // 5. Carts, cart_items, checkout_cart, update_fulfillment, cancel_shop_order
      let cartId = '';
      let shopOrderId = '';
      let cancelShopOrderId = '';

      await asRole(tx, 'authenticated', normalUserId, async () => {
        const [cart] = await tx`
          INSERT INTO public.carts (user_id, museum_id)
          VALUES (${normalUserId}::uuid, ${museumAId}::uuid)
          RETURNING id
        `;
        cartId = cart.id;

        await expectError(
          tx,
          (sp) =>
            sp`INSERT INTO public.carts (user_id, museum_id) VALUES (${normalUserId}::uuid, ${museumAId}::uuid)`,
          'carts_active_user_museum_uidx',
          'duplicate active cart rejected'
        );

        await expectError(
          tx,
          (sp) =>
            sp`INSERT INTO public.cart_items (cart_id, product_id, quantity) VALUES (${cartId}::uuid, ${museumBProductId}::uuid, 1)`,
          'cart_product_museum_mismatch',
          'cross-museum cart item rejected'
        );

        await tx`
          INSERT INTO public.cart_items (cart_id, product_id, quantity)
          VALUES (${cartId}::uuid, ${museumAProductId}::uuid, 2)
        `;

        const shipping = {
          shipping_name: 'Nguyen Van A',
          shipping_phone: '0900000000',
          shipping_address: '1 Le Loi',
          shipping_city: 'Ho Chi Minh City',
        };
        const [co] = await tx`SELECT public.checkout_cart(${cartId}::uuid, ${sql.json(shipping)}) AS id`;
        shopOrderId = co.id;

        const [so] = await tx`
          SELECT status, payment_status, subtotal::text, shipping_fee::text, total_amount::text
          FROM public.shop_orders WHERE id = ${shopOrderId}::uuid
        `;
        assert.equal(so.status, 'confirmed');
        assert.equal(so.payment_status, 'paid');
        assert.equal(so.subtotal, '50000.00');
        assert.equal(so.shipping_fee, '30000.00');
        assert.equal(so.total_amount, '80000.00');

        const [sInv] = await tx`
          SELECT invoice_number, total_amount::text FROM public.shop_invoices WHERE order_id = ${shopOrderId}::uuid
        `;
        assert.ok(sInv.invoice_number.startsWith('SHP-'));
        assert.equal(sInv.total_amount, '80000.00');

        const [prodAfter] = await tx`SELECT stock_quantity FROM public.souvenir_products WHERE id = ${museumAProductId}::uuid`;
        assert.equal(prodAfter.stock_quantity, 1);

        const delRes = await tx`DELETE FROM public.carts WHERE id = ${cartId}::uuid RETURNING id`;
        assert.equal(delRes.length, 0);

        const [cart2] = await tx`
          INSERT INTO public.carts (user_id, museum_id)
          VALUES (${normalUserId}::uuid, ${museumAId}::uuid)
          RETURNING id
        `;
        await tx`
          INSERT INTO public.cart_items (cart_id, product_id, quantity)
          VALUES (${cart2.id}::uuid, ${museumAProductId}::uuid, 2)
        `;
        await expectError(
          tx,
          (sp) =>
            sp`SELECT public.checkout_cart(${cart2.id}::uuid, ${sql.json(shipping)})`,
          'out_of_stock',
          'checkout rejects out_of_stock'
        );

        await tx`UPDATE public.cart_items SET quantity = 1 WHERE cart_id = ${cart2.id}::uuid`;
        const [co2] = await tx`SELECT public.checkout_cart(${cart2.id}::uuid, ${sql.json(shipping)}) AS id`;
        cancelShopOrderId = co2.id;

        await tx`SELECT public.cancel_shop_order(${cancelShopOrderId}::uuid)`;
        const [restored] = await tx`SELECT stock_quantity FROM public.souvenir_products WHERE id = ${museumAProductId}::uuid`;
        assert.equal(restored.stock_quantity, 1);
      });

      await asRole(tx, 'authenticated', adminUserId, async () => {
        await expectError(
          tx,
          (sp) => sp`SELECT public.update_fulfillment(${shopOrderId}::uuid, 'completed')`,
          'invalid_transition',
          'cannot skip shipped -> completed'
        );
        await tx`SELECT public.update_fulfillment(${shopOrderId}::uuid, 'shipped')`;
        await expectError(
          tx,
          (sp) => sp`SELECT public.cancel_shop_order(${shopOrderId}::uuid)`,
          'already_shipped',
          'cannot cancel shipped shop order'
        );
        await tx`SELECT public.update_fulfillment(${shopOrderId}::uuid, 'completed')`;
      });
      console.log('✓ Cart, checkout_cart, update_fulfillment, and cancel_shop_order verified');

      // 6. Membership revocation takes effect immediately
      await tx`
        UPDATE public.museum_admins
        SET status = 'revoked', revoked_at = now()
        WHERE museum_id = ${museumAId}::uuid AND user_id = ${adminUserId}::uuid
      `;

      await asRole(tx, 'authenticated', adminUserId, async () => {
        const drafts = await tx`SELECT id FROM public.artifacts WHERE id = ${museumAArtifactDraftId}::uuid`;
        assert.equal(drafts.length, 0, 'revoked admin must immediately lose draft read access');

        const orders = await tx`SELECT id FROM public.ticket_orders WHERE museum_id = ${museumAId}::uuid`;
        assert.equal(orders.length, 0, 'revoked admin must immediately lose order read access');

        await expectError(
          tx,
          (sp) =>
            sp`INSERT INTO public.artifacts (museum_id, name, created_by) VALUES (${museumAId}::uuid, 'Post-Revoke', ${adminUserId}::uuid)`,
          'row-level security',
          'revoked admin cannot insert artifact'
        );
      });
      console.log('✓ Immediate membership revocation verified');

      // 7. Storage RLS policy check (validates path-scoped can_manage_museum)
      await asRole(tx, 'authenticated', normalUserId, async () => {
        await expectError(
          tx,
          (sp) =>
            sp`INSERT INTO storage.objects (bucket_id, name) VALUES ('museum-media', ${`${museumAId}/artifact/${museumAArtifactPubId}/pic.jpg`})`,
          'row-level security',
          'normal_user cannot upload to storage'
        );
      });
      console.log('✓ Storage RLS policy verified');

      throw new Error(ROLLBACK_SENTINEL);
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message === ROLLBACK_SENTINEL) {
      console.log('✓ Test transaction rolled back cleanly');
    } else {
      throw err;
    }
  } finally {
    await sql.end();
  }
}

async function main() {
  await verifyHttpSurface();
  await verifyDatabaseSecurityAndRpcs();
  console.log('All DB security, RLS, trigger, and RPC checks passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

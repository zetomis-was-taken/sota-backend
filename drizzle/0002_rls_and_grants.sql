-- Private schema and RLS helper functions (single source of authorization logic)
CREATE SCHEMA IF NOT EXISTS "private";--> statement-breakpoint

REVOKE ALL ON SCHEMA "private" FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA "private" TO "authenticated";--> statement-breakpoint

CREATE OR REPLACE FUNCTION "private"."is_super_admin"()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = (SELECT auth.uid())
      AND ur.role = 'super_admin'::public.app_role
  );
$$;--> statement-breakpoint

CREATE OR REPLACE FUNCTION "private"."can_manage_museum"(p_museum_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (
    private.is_super_admin()
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.museum_admins ma ON ma.user_id = ur.user_id
      WHERE ur.user_id = (SELECT auth.uid())
        AND ur.role = 'admin_user'::public.app_role
        AND ma.museum_id = p_museum_id
        AND ma.status = 'active'::public.admin_membership_status
    )
  );
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION "private"."is_super_admin"() FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION "private"."can_manage_museum"(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."is_super_admin"() TO "authenticated";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "private"."can_manage_museum"(uuid) TO "authenticated";--> statement-breakpoint

-- Least-privilege table and column grants (revoke Supabase's broad default grants)
REVOKE ALL ON SEQUENCE "public"."invoice_seq" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."users" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."users" TO "authenticated";--> statement-breakpoint
GRANT UPDATE (display_name, phone) ON TABLE "public"."users" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."user_roles" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."user_roles" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."museum_admins" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."museum_admins" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."museums" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."museums" TO "anon", "authenticated";--> statement-breakpoint
GRANT INSERT, UPDATE ON TABLE "public"."museums" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."artifacts" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."artifacts" TO "anon", "authenticated";--> statement-breakpoint
GRANT INSERT, UPDATE ON TABLE "public"."artifacts" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."souvenir_products" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."souvenir_products" TO "anon", "authenticated";--> statement-breakpoint
GRANT INSERT, UPDATE ON TABLE "public"."souvenir_products" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."ticket_types" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."ticket_types" TO "anon", "authenticated";--> statement-breakpoint
GRANT INSERT, UPDATE ON TABLE "public"."ticket_types" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."media_assets" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."media_assets" TO "anon", "authenticated";--> statement-breakpoint
GRANT INSERT, DELETE ON TABLE "public"."media_assets" TO "authenticated";--> statement-breakpoint
GRANT UPDATE (sort_order, is_primary) ON TABLE "public"."media_assets" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."carts" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "public"."carts" TO "authenticated";--> statement-breakpoint
GRANT UPDATE (status) ON TABLE "public"."carts" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."cart_items" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON TABLE "public"."cart_items" TO "authenticated";--> statement-breakpoint
GRANT UPDATE (quantity) ON TABLE "public"."cart_items" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."ticket_orders" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."ticket_orders" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."ticket_order_items" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."ticket_order_items" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."ticket_invoices" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."ticket_invoices" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."shop_orders" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."shop_orders" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."shop_order_items" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."shop_order_items" TO "authenticated";--> statement-breakpoint

REVOKE ALL ON TABLE "public"."shop_invoices" FROM PUBLIC, "anon", "authenticated";--> statement-breakpoint
GRANT SELECT ON TABLE "public"."shop_invoices" TO "authenticated";--> statement-breakpoint

-- RLS Policies: users
CREATE POLICY "users_select_own_or_super_admin"
  ON "public"."users"
  FOR SELECT
  TO "authenticated"
  USING (id = (SELECT auth.uid()) OR private.is_super_admin());--> statement-breakpoint

CREATE POLICY "users_update_own_or_super_admin"
  ON "public"."users"
  FOR UPDATE
  TO "authenticated"
  USING (id = (SELECT auth.uid()) OR private.is_super_admin())
  WITH CHECK (id = (SELECT auth.uid()) OR private.is_super_admin());--> statement-breakpoint

-- RLS Policies: user_roles
CREATE POLICY "user_roles_select_own_or_super_admin"
  ON "public"."user_roles"
  FOR SELECT
  TO "authenticated"
  USING (user_id = (SELECT auth.uid()) OR private.is_super_admin());--> statement-breakpoint

-- RLS Policies: museum_admins (uses private.can_manage_museum to avoid policy recursion)
CREATE POLICY "museum_admins_select_own_or_manager"
  ON "public"."museum_admins"
  FOR SELECT
  TO "authenticated"
  USING (user_id = (SELECT auth.uid()) OR private.can_manage_museum(museum_id));--> statement-breakpoint

-- RLS Policies: museums
CREATE POLICY "museums_select_anon_published"
  ON "public"."museums"
  FOR SELECT
  TO "anon"
  USING (status = 'published'::public.publication_status);--> statement-breakpoint

CREATE POLICY "museums_select_auth_published_or_managed"
  ON "public"."museums"
  FOR SELECT
  TO "authenticated"
  USING (
    status = 'published'::public.publication_status
    OR private.can_manage_museum(id)
  );--> statement-breakpoint

CREATE POLICY "museums_insert_super_admin"
  ON "public"."museums"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    private.is_super_admin()
    AND created_by = (SELECT auth.uid())
  );--> statement-breakpoint

CREATE POLICY "museums_update_manager"
  ON "public"."museums"
  FOR UPDATE
  TO "authenticated"
  USING (private.can_manage_museum(id))
  WITH CHECK (private.can_manage_museum(id));--> statement-breakpoint

-- RLS Policies: artifacts
CREATE POLICY "artifacts_select_anon_published"
  ON "public"."artifacts"
  FOR SELECT
  TO "anon"
  USING (
    status = 'published'::public.publication_status
    AND EXISTS (
      SELECT 1
      FROM public.museums m
      WHERE m.id = artifacts.museum_id
        AND m.status = 'published'::public.publication_status
    )
  );--> statement-breakpoint

CREATE POLICY "artifacts_select_auth_published_or_managed"
  ON "public"."artifacts"
  FOR SELECT
  TO "authenticated"
  USING (
    (
      status = 'published'::public.publication_status
      AND EXISTS (
        SELECT 1
        FROM public.museums m
        WHERE m.id = artifacts.museum_id
          AND m.status = 'published'::public.publication_status
      )
    )
    OR private.can_manage_museum(museum_id)
  );--> statement-breakpoint

CREATE POLICY "artifacts_insert_manager"
  ON "public"."artifacts"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    private.can_manage_museum(museum_id)
    AND created_by = (SELECT auth.uid())
  );--> statement-breakpoint

CREATE POLICY "artifacts_update_manager"
  ON "public"."artifacts"
  FOR UPDATE
  TO "authenticated"
  USING (private.can_manage_museum(museum_id))
  WITH CHECK (private.can_manage_museum(museum_id));--> statement-breakpoint

-- RLS Policies: souvenir_products
CREATE POLICY "souvenir_products_select_anon_published"
  ON "public"."souvenir_products"
  FOR SELECT
  TO "anon"
  USING (
    status = 'published'::public.publication_status
    AND EXISTS (
      SELECT 1
      FROM public.museums m
      WHERE m.id = souvenir_products.museum_id
        AND m.status = 'published'::public.publication_status
    )
  );--> statement-breakpoint

CREATE POLICY "souvenir_products_select_auth_published_or_managed"
  ON "public"."souvenir_products"
  FOR SELECT
  TO "authenticated"
  USING (
    (
      status = 'published'::public.publication_status
      AND EXISTS (
        SELECT 1
        FROM public.museums m
        WHERE m.id = souvenir_products.museum_id
          AND m.status = 'published'::public.publication_status
      )
    )
    OR private.can_manage_museum(museum_id)
  );--> statement-breakpoint

CREATE POLICY "souvenir_products_insert_manager"
  ON "public"."souvenir_products"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    private.can_manage_museum(museum_id)
    AND created_by = (SELECT auth.uid())
  );--> statement-breakpoint

CREATE POLICY "souvenir_products_update_manager"
  ON "public"."souvenir_products"
  FOR UPDATE
  TO "authenticated"
  USING (private.can_manage_museum(museum_id))
  WITH CHECK (private.can_manage_museum(museum_id));--> statement-breakpoint

-- RLS Policies: ticket_types
CREATE POLICY "ticket_types_select_anon_available"
  ON "public"."ticket_types"
  FOR SELECT
  TO "anon"
  USING (
    is_available = true
    AND EXISTS (
      SELECT 1
      FROM public.museums m
      WHERE m.id = ticket_types.museum_id
        AND m.status = 'published'::public.publication_status
    )
  );--> statement-breakpoint

CREATE POLICY "ticket_types_select_auth_available_or_managed"
  ON "public"."ticket_types"
  FOR SELECT
  TO "authenticated"
  USING (
    (
      is_available = true
      AND EXISTS (
        SELECT 1
        FROM public.museums m
        WHERE m.id = ticket_types.museum_id
          AND m.status = 'published'::public.publication_status
      )
    )
    OR private.can_manage_museum(museum_id)
  );--> statement-breakpoint

CREATE POLICY "ticket_types_insert_manager"
  ON "public"."ticket_types"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (private.can_manage_museum(museum_id));--> statement-breakpoint

CREATE POLICY "ticket_types_update_manager"
  ON "public"."ticket_types"
  FOR UPDATE
  TO "authenticated"
  USING (private.can_manage_museum(museum_id))
  WITH CHECK (private.can_manage_museum(museum_id));--> statement-breakpoint

-- RLS Policies: media_assets
CREATE POLICY "media_assets_select_anon_public"
  ON "public"."media_assets"
  FOR SELECT
  TO "anon"
  USING (
    EXISTS (
      SELECT 1
      FROM public.museums m
      WHERE m.id = media_assets.museum_id
        AND m.status = 'published'::public.publication_status
    )
    AND (
      (
        media_assets.entity_type = 'artifact'::public.media_entity_type
        AND EXISTS (
          SELECT 1
          FROM public.artifacts a
          WHERE a.id = media_assets.entity_id
            AND a.museum_id = media_assets.museum_id
            AND a.status = 'published'::public.publication_status
        )
      )
      OR (
        media_assets.entity_type = 'souvenir'::public.media_entity_type
        AND EXISTS (
          SELECT 1
          FROM public.souvenir_products sp
          WHERE sp.id = media_assets.entity_id
            AND sp.museum_id = media_assets.museum_id
            AND sp.status = 'published'::public.publication_status
        )
      )
    )
  );--> statement-breakpoint

CREATE POLICY "media_assets_select_auth_public_or_managed"
  ON "public"."media_assets"
  FOR SELECT
  TO "authenticated"
  USING (
    (
      EXISTS (
        SELECT 1
        FROM public.museums m
        WHERE m.id = media_assets.museum_id
          AND m.status = 'published'::public.publication_status
      )
      AND (
        (
          media_assets.entity_type = 'artifact'::public.media_entity_type
          AND EXISTS (
            SELECT 1
            FROM public.artifacts a
            WHERE a.id = media_assets.entity_id
              AND a.museum_id = media_assets.museum_id
              AND a.status = 'published'::public.publication_status
          )
        )
        OR (
          media_assets.entity_type = 'souvenir'::public.media_entity_type
          AND EXISTS (
            SELECT 1
            FROM public.souvenir_products sp
            WHERE sp.id = media_assets.entity_id
              AND sp.museum_id = media_assets.museum_id
              AND sp.status = 'published'::public.publication_status
          )
        )
      )
    )
    OR private.can_manage_museum(museum_id)
  );--> statement-breakpoint

CREATE POLICY "media_assets_insert_manager"
  ON "public"."media_assets"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    private.can_manage_museum(museum_id)
    AND created_by = (SELECT auth.uid())
  );--> statement-breakpoint

CREATE POLICY "media_assets_update_manager"
  ON "public"."media_assets"
  FOR UPDATE
  TO "authenticated"
  USING (private.can_manage_museum(museum_id))
  WITH CHECK (private.can_manage_museum(museum_id));--> statement-breakpoint

CREATE POLICY "media_assets_delete_manager"
  ON "public"."media_assets"
  FOR DELETE
  TO "authenticated"
  USING (private.can_manage_museum(museum_id));--> statement-breakpoint

-- RLS Policies: carts
CREATE POLICY "carts_select_own_or_super_admin"
  ON "public"."carts"
  FOR SELECT
  TO "authenticated"
  USING (user_id = (SELECT auth.uid()) OR private.is_super_admin());--> statement-breakpoint

CREATE POLICY "carts_insert_own_active_or_super_admin"
  ON "public"."carts"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    (user_id = (SELECT auth.uid()) AND status = 'active'::public.cart_status)
    OR private.is_super_admin()
  );--> statement-breakpoint

CREATE POLICY "carts_update_own_abandon_or_super_admin"
  ON "public"."carts"
  FOR UPDATE
  TO "authenticated"
  USING (
    (user_id = (SELECT auth.uid()) AND status = 'active'::public.cart_status)
    OR private.is_super_admin()
  )
  WITH CHECK (
    (user_id = (SELECT auth.uid()) AND status = 'abandoned'::public.cart_status)
    OR private.is_super_admin()
  );--> statement-breakpoint

CREATE POLICY "carts_delete_own_non_converted_or_super_admin"
  ON "public"."carts"
  FOR DELETE
  TO "authenticated"
  USING (
    (user_id = (SELECT auth.uid()) AND status <> 'converted'::public.cart_status)
    OR private.is_super_admin()
  );--> statement-breakpoint

-- RLS Policies: cart_items
CREATE POLICY "cart_items_select_own_or_super_admin"
  ON "public"."cart_items"
  FOR SELECT
  TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND (c.user_id = (SELECT auth.uid()) OR private.is_super_admin())
    )
  );--> statement-breakpoint

CREATE POLICY "cart_items_insert_own_active_or_super_admin"
  ON "public"."cart_items"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND (
          (c.user_id = (SELECT auth.uid()) AND c.status = 'active'::public.cart_status)
          OR private.is_super_admin()
        )
    )
  );--> statement-breakpoint

CREATE POLICY "cart_items_update_own_active_or_super_admin"
  ON "public"."cart_items"
  FOR UPDATE
  TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND (
          (c.user_id = (SELECT auth.uid()) AND c.status = 'active'::public.cart_status)
          OR private.is_super_admin()
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND (
          (c.user_id = (SELECT auth.uid()) AND c.status = 'active'::public.cart_status)
          OR private.is_super_admin()
        )
    )
  );--> statement-breakpoint

CREATE POLICY "cart_items_delete_own_active_or_super_admin"
  ON "public"."cart_items"
  FOR DELETE
  TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM public.carts c
      WHERE c.id = cart_items.cart_id
        AND (
          (c.user_id = (SELECT auth.uid()) AND c.status = 'active'::public.cart_status)
          OR private.is_super_admin()
        )
    )
  );--> statement-breakpoint

-- RLS Policies: ticket_orders, ticket_order_items, ticket_invoices (read-only)
CREATE POLICY "ticket_orders_select_own_or_manager"
  ON "public"."ticket_orders"
  FOR SELECT
  TO "authenticated"
  USING (user_id = (SELECT auth.uid()) OR private.can_manage_museum(museum_id));--> statement-breakpoint

CREATE POLICY "ticket_order_items_select_own_or_manager"
  ON "public"."ticket_order_items"
  FOR SELECT
  TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM public.ticket_orders o
      WHERE o.id = ticket_order_items.ticket_order_id
        AND (o.user_id = (SELECT auth.uid()) OR private.can_manage_museum(o.museum_id))
    )
  );--> statement-breakpoint

CREATE POLICY "ticket_invoices_select_own_or_manager"
  ON "public"."ticket_invoices"
  FOR SELECT
  TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM public.ticket_orders o
      WHERE o.id = ticket_invoices.ticket_order_id
        AND (o.user_id = (SELECT auth.uid()) OR private.can_manage_museum(o.museum_id))
    )
  );--> statement-breakpoint

-- RLS Policies: shop_orders, shop_order_items, shop_invoices (read-only)
CREATE POLICY "shop_orders_select_own_or_manager"
  ON "public"."shop_orders"
  FOR SELECT
  TO "authenticated"
  USING (user_id = (SELECT auth.uid()) OR private.can_manage_museum(museum_id));--> statement-breakpoint

CREATE POLICY "shop_order_items_select_own_or_manager"
  ON "public"."shop_order_items"
  FOR SELECT
  TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM public.shop_orders o
      WHERE o.id = shop_order_items.order_id
        AND (o.user_id = (SELECT auth.uid()) OR private.can_manage_museum(o.museum_id))
    )
  );--> statement-breakpoint

CREATE POLICY "shop_invoices_select_own_or_manager"
  ON "public"."shop_invoices"
  FOR SELECT
  TO "authenticated"
  USING (
    EXISTS (
      SELECT 1
      FROM public.shop_orders o
      WHERE o.id = shop_invoices.order_id
        AND (o.user_id = (SELECT auth.uid()) OR private.can_manage_museum(o.museum_id))
    )
  );

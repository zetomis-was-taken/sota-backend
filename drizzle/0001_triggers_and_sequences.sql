-- Shared sequence for globally unique invoice numbers (TKT-N / SHP-N)
CREATE SEQUENCE IF NOT EXISTS "public"."invoice_seq" START WITH 1 INCREMENT BY 1;--> statement-breakpoint

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION "public"."set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "set_users_updated_at"
  BEFORE UPDATE ON "public"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_museums_updated_at"
  BEFORE UPDATE ON "public"."museums"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_artifacts_updated_at"
  BEFORE UPDATE ON "public"."artifacts"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_souvenir_products_updated_at"
  BEFORE UPDATE ON "public"."souvenir_products"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_media_assets_updated_at"
  BEFORE UPDATE ON "public"."media_assets"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_ticket_types_updated_at"
  BEFORE UPDATE ON "public"."ticket_types"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_ticket_orders_updated_at"
  BEFORE UPDATE ON "public"."ticket_orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_ticket_order_items_updated_at"
  BEFORE UPDATE ON "public"."ticket_order_items"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_carts_updated_at"
  BEFORE UPDATE ON "public"."carts"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_cart_items_updated_at"
  BEFORE UPDATE ON "public"."cart_items"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_shop_orders_updated_at"
  BEFORE UPDATE ON "public"."shop_orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

CREATE TRIGGER "set_shop_order_items_updated_at"
  BEFORE UPDATE ON "public"."shop_order_items"
  FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();--> statement-breakpoint

-- Auth signup trigger: creates public.users and user_roles(normal_user) idempotently
CREATE OR REPLACE FUNCTION "public"."handle_new_auth_user"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.users (id, display_name)
  VALUES (
    NEW.id,
    NULLIF(trim(COALESCE(NEW.raw_user_meta_data->>'display_name', '')), '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'normal_user'::public.app_role)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS "on_auth_user_created" ON "auth"."users";--> statement-breakpoint

CREATE TRIGGER "on_auth_user_created"
  AFTER INSERT ON "auth"."users"
  FOR EACH ROW EXECUTE FUNCTION "public"."handle_new_auth_user"();--> statement-breakpoint

-- Validate polymorphic media_assets target exists and belongs to the same museum
CREATE OR REPLACE FUNCTION "public"."validate_media_asset_entity"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_exists boolean;
BEGIN
  IF NEW.entity_type = 'artifact'::public.media_entity_type THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.artifacts a
      WHERE a.id = NEW.entity_id
        AND a.museum_id = NEW.museum_id
    ) INTO v_exists;
  ELSIF NEW.entity_type = 'souvenir'::public.media_entity_type THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.souvenir_products sp
      WHERE sp.id = NEW.entity_id
        AND sp.museum_id = NEW.museum_id
    ) INTO v_exists;
  ELSE
    v_exists := false;
  END IF;

  IF NOT v_exists THEN
    RAISE EXCEPTION 'media_entity_museum_mismatch'
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "validate_media_assets_entity"
  BEFORE INSERT OR UPDATE OF "museum_id", "entity_type", "entity_id" ON "public"."media_assets"
  FOR EACH ROW EXECUTE FUNCTION "public"."validate_media_asset_entity"();--> statement-breakpoint

-- Require cart_items.product_id to belong to the cart's museum
CREATE OR REPLACE FUNCTION "public"."validate_cart_item_museum"()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_matches boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.carts c
    JOIN public.souvenir_products sp ON sp.id = NEW.product_id
    WHERE c.id = NEW.cart_id
      AND c.museum_id = sp.museum_id
  ) INTO v_matches;

  IF NOT v_matches THEN
    RAISE EXCEPTION 'cart_product_museum_mismatch'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "validate_cart_items_museum"
  BEFORE INSERT OR UPDATE OF "cart_id", "product_id" ON "public"."cart_items"
  FOR EACH ROW EXECUTE FUNCTION "public"."validate_cart_item_museum"();--> statement-breakpoint

-- Prevent changing museum_id after row creation
CREATE OR REPLACE FUNCTION "public"."prevent_museum_id_change"()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.museum_id IS DISTINCT FROM NEW.museum_id THEN
    RAISE EXCEPTION 'museum_id_immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

CREATE TRIGGER "prevent_artifacts_museum_id_change"
  BEFORE UPDATE OF "museum_id" ON "public"."artifacts"
  FOR EACH ROW EXECUTE FUNCTION "public"."prevent_museum_id_change"();--> statement-breakpoint

CREATE TRIGGER "prevent_souvenir_products_museum_id_change"
  BEFORE UPDATE OF "museum_id" ON "public"."souvenir_products"
  FOR EACH ROW EXECUTE FUNCTION "public"."prevent_museum_id_change"();--> statement-breakpoint

CREATE TRIGGER "prevent_ticket_types_museum_id_change"
  BEFORE UPDATE OF "museum_id" ON "public"."ticket_types"
  FOR EACH ROW EXECUTE FUNCTION "public"."prevent_museum_id_change"();--> statement-breakpoint

CREATE TRIGGER "prevent_media_assets_museum_id_change"
  BEFORE UPDATE OF "museum_id" ON "public"."media_assets"
  FOR EACH ROW EXECUTE FUNCTION "public"."prevent_museum_id_change"();

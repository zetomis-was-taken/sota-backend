-- 1. purchase_tickets(p_museum_id, p_visit_date, p_time_slot, p_items) -> uuid
CREATE OR REPLACE FUNCTION "public"."purchase_tickets"(
  "p_museum_id" uuid,
  "p_visit_date" date,
  "p_time_slot" text,
  "p_items" jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_today date;
  v_museum_status public.publication_status;
  v_elem jsonb;
  v_ticket_type_id uuid;
  v_qty integer;
  v_price numeric(12, 2);
  v_total numeric(12, 2) := 0;
  v_order_id uuid;
  v_entry_code text;
  v_billing_name text;
  v_billing_email text;
  v_seen_ids uuid[] := '{}'::uuid[];
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF p_time_slot IS NULL OR p_time_slot NOT IN ('09:00-11:00', '11:00-13:00', '14:00-16:00', '16:00-18:00') THEN
    RAISE EXCEPTION 'invalid_time_slot';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF p_visit_date IS NULL OR p_visit_date < v_today THEN
    RAISE EXCEPTION 'invalid_visit_date';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'invalid_items';
  END IF;

  SELECT m.status
  INTO v_museum_status
  FROM public.museums m
  WHERE m.id = p_museum_id;

  IF v_museum_status IS DISTINCT FROM 'published'::public.publication_status THEN
    RAISE EXCEPTION 'museum_not_available';
  END IF;

  -- First pass: validate structure, quantities, uniqueness, and availability; compute total
  FOR v_elem IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR COALESCE(v_elem->>'ticket_type_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       OR COALESCE(v_elem->>'quantity', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'invalid_items';
    END IF;

    v_ticket_type_id := (v_elem->>'ticket_type_id')::uuid;
    v_qty := (v_elem->>'quantity')::integer;

    IF v_qty <= 0 OR v_ticket_type_id = ANY(v_seen_ids) THEN
      RAISE EXCEPTION 'invalid_items';
    END IF;
    v_seen_ids := array_append(v_seen_ids, v_ticket_type_id);

    SELECT tt.price
    INTO v_price
    FROM public.ticket_types tt
    WHERE tt.id = v_ticket_type_id
      AND tt.museum_id = p_museum_id
      AND tt.is_available = true;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ticket_type_unavailable';
    END IF;

    v_total := v_total + (v_price * v_qty);
  END LOOP;

  v_entry_code := 'ENT-' || upper(encode(extensions.gen_random_bytes(8), 'hex'));

  INSERT INTO public.ticket_orders (
    user_id,
    museum_id,
    visit_date,
    time_slot,
    status,
    payment_status,
    total_amount,
    currency,
    entry_code
  )
  VALUES (
    v_uid,
    p_museum_id,
    p_visit_date,
    p_time_slot,
    'confirmed'::public.ticket_order_status,
    'paid'::public.payment_status,
    v_total,
    'VND',
    v_entry_code
  )
  RETURNING id INTO v_order_id;

  -- Second pass: insert order items using current prices
  INSERT INTO public.ticket_order_items (
    ticket_order_id,
    ticket_type_id,
    quantity,
    unit_price
  )
  SELECT
    v_order_id,
    tt.id,
    (elem->>'quantity')::integer,
    tt.price
  FROM jsonb_array_elements(p_items) AS elem
  JOIN public.ticket_types tt
    ON tt.id = (elem->>'ticket_type_id')::uuid
   AND tt.museum_id = p_museum_id
   AND tt.is_available = true;

  SELECT
    COALESCE(NULLIF(trim(u.display_name), ''), au.email, 'Guest'),
    COALESCE(au.email, '')
  INTO v_billing_name, v_billing_email
  FROM auth.users au
  LEFT JOIN public.users u ON u.id = au.id
  WHERE au.id = v_uid;

  INSERT INTO public.ticket_invoices (
    ticket_order_id,
    invoice_number,
    billing_name,
    billing_email,
    total_amount,
    currency
  )
  VALUES (
    v_order_id,
    'TKT-' || nextval('public.invoice_seq'),
    COALESCE(v_billing_name, 'Guest'),
    COALESCE(v_billing_email, ''),
    v_total,
    'VND'
  );

  RETURN v_order_id;
END;
$$;--> statement-breakpoint

-- 2. checkout_cart(p_cart_id, p_shipping) -> uuid
CREATE OR REPLACE FUNCTION "public"."checkout_cart"(
  "p_cart_id" uuid,
  "p_shipping" jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  c_shipping_fee CONSTANT numeric(12, 2) := 30000.00;
  v_uid uuid;
  v_cart public.carts%ROWTYPE;
  v_museum_status public.publication_status;
  v_shipping_name text;
  v_shipping_phone text;
  v_shipping_address text;
  v_shipping_city text;
  v_subtotal numeric(12, 2) := 0;
  v_item_count integer := 0;
  v_item record;
  v_order_id uuid;
  v_billing_name text;
  v_billing_email text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_cart
  FROM public.carts c
  WHERE c.id = p_cart_id
  FOR UPDATE;

  IF NOT FOUND OR v_cart.user_id <> v_uid THEN
    RAISE EXCEPTION 'cart_not_found';
  END IF;

  IF v_cart.status <> 'active'::public.cart_status THEN
    RAISE EXCEPTION 'cart_not_active';
  END IF;

  IF p_shipping IS NULL OR jsonb_typeof(p_shipping) <> 'object' THEN
    RAISE EXCEPTION 'invalid_shipping';
  END IF;

  v_shipping_name := NULLIF(trim(COALESCE(p_shipping->>'shipping_name', '')), '');
  v_shipping_phone := NULLIF(trim(COALESCE(p_shipping->>'shipping_phone', '')), '');
  v_shipping_address := NULLIF(trim(COALESCE(p_shipping->>'shipping_address', '')), '');
  v_shipping_city := NULLIF(trim(COALESCE(p_shipping->>'shipping_city', '')), '');

  IF v_shipping_name IS NULL OR v_shipping_phone IS NULL OR v_shipping_address IS NULL THEN
    RAISE EXCEPTION 'invalid_shipping';
  END IF;

  SELECT m.status
  INTO v_museum_status
  FROM public.museums m
  WHERE m.id = v_cart.museum_id;

  IF v_museum_status IS DISTINCT FROM 'published'::public.publication_status THEN
    RAISE EXCEPTION 'product_unavailable';
  END IF;

  -- Lock products in deterministic order to avoid deadlocks
  FOR v_item IN
    SELECT
      ci.product_id,
      ci.quantity,
      sp.museum_id AS product_museum_id,
      sp.name AS product_name,
      sp.price,
      sp.stock_quantity,
      sp.status
    FROM public.cart_items ci
    JOIN public.souvenir_products sp ON sp.id = ci.product_id
    WHERE ci.cart_id = v_cart.id
    ORDER BY sp.id
    FOR UPDATE OF sp
  LOOP
    v_item_count := v_item_count + 1;

    IF v_item.product_museum_id <> v_cart.museum_id
       OR v_item.status <> 'published'::public.publication_status THEN
      RAISE EXCEPTION 'product_unavailable';
    END IF;

    IF v_item.stock_quantity < v_item.quantity THEN
      RAISE EXCEPTION 'out_of_stock';
    END IF;

    v_subtotal := v_subtotal + (v_item.price * v_item.quantity);
  END LOOP;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'cart_not_active';
  END IF;

  INSERT INTO public.shop_orders (
    user_id,
    museum_id,
    status,
    payment_status,
    subtotal,
    shipping_fee,
    currency,
    shipping_name,
    shipping_phone,
    shipping_address,
    shipping_city
  )
  VALUES (
    v_uid,
    v_cart.museum_id,
    'confirmed'::public.shop_order_status,
    'paid'::public.payment_status,
    v_subtotal,
    c_shipping_fee,
    'VND',
    v_shipping_name,
    v_shipping_phone,
    v_shipping_address,
    v_shipping_city
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.shop_order_items (
    order_id,
    product_id,
    product_name,
    unit_price,
    quantity
  )
  SELECT
    v_order_id,
    sp.id,
    sp.name,
    sp.price,
    ci.quantity
  FROM public.cart_items ci
  JOIN public.souvenir_products sp ON sp.id = ci.product_id
  WHERE ci.cart_id = v_cart.id
  ORDER BY sp.id;

  FOR v_item IN
    SELECT ci.product_id, ci.quantity
    FROM public.cart_items ci
    WHERE ci.cart_id = v_cart.id
    ORDER BY ci.product_id
  LOOP
    UPDATE public.souvenir_products
    SET stock_quantity = stock_quantity - v_item.quantity
    WHERE id = v_item.product_id
      AND stock_quantity >= v_item.quantity;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'out_of_stock';
    END IF;
  END LOOP;

  SELECT
    COALESCE(NULLIF(trim(u.display_name), ''), au.email, v_shipping_name),
    COALESCE(au.email, '')
  INTO v_billing_name, v_billing_email
  FROM auth.users au
  LEFT JOIN public.users u ON u.id = au.id
  WHERE au.id = v_uid;

  INSERT INTO public.shop_invoices (
    order_id,
    invoice_number,
    billing_name,
    billing_email,
    total_amount,
    currency
  )
  VALUES (
    v_order_id,
    'SHP-' || nextval('public.invoice_seq'),
    COALESCE(v_billing_name, v_shipping_name),
    COALESCE(v_billing_email, ''),
    v_subtotal + c_shipping_fee,
    'VND'
  );

  UPDATE public.carts
  SET status = 'converted'::public.cart_status
  WHERE id = v_cart.id;

  RETURN v_order_id;
END;
$$;--> statement-breakpoint

-- 3. redeem_entry(p_entry_code) -> uuid
CREATE OR REPLACE FUNCTION "public"."redeem_entry"("p_entry_code" text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_today date;
  v_order public.ticket_orders%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  IF NULLIF(trim(COALESCE(p_entry_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'entry_code_not_found';
  END IF;

  SELECT *
  INTO v_order
  FROM public.ticket_orders o
  WHERE o.entry_code = trim(p_entry_code)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'entry_code_not_found';
  END IF;

  IF NOT private.can_manage_museum(v_order.museum_id) THEN
    RAISE EXCEPTION 'not_museum_admin';
  END IF;

  IF v_order.status = 'used'::public.ticket_order_status THEN
    RAISE EXCEPTION 'already_used';
  END IF;

  IF v_order.status <> 'confirmed'::public.ticket_order_status THEN
    RAISE EXCEPTION 'order_not_confirmed';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF v_order.visit_date <> v_today THEN
    RAISE EXCEPTION 'wrong_visit_date';
  END IF;

  UPDATE public.ticket_orders
  SET status = 'used'::public.ticket_order_status,
      used_at = now()
  WHERE id = v_order.id;

  RETURN v_order.id;
END;
$$;--> statement-breakpoint

-- 4. update_fulfillment(p_order_id, p_status) -> void
CREATE OR REPLACE FUNCTION "public"."update_fulfillment"(
  "p_order_id" uuid,
  "p_status" text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_order public.shop_orders%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_order
  FROM public.shop_orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF NOT private.can_manage_museum(v_order.museum_id) THEN
    RAISE EXCEPTION 'not_museum_admin';
  END IF;

  IF NOT (
    (v_order.status = 'confirmed'::public.shop_order_status AND p_status = 'shipped')
    OR (v_order.status = 'shipped'::public.shop_order_status AND p_status = 'completed')
  ) THEN
    RAISE EXCEPTION 'invalid_transition';
  END IF;

  UPDATE public.shop_orders
  SET status = p_status::public.shop_order_status
  WHERE id = v_order.id;
END;
$$;--> statement-breakpoint

-- 5. cancel_ticket_order(p_order_id) -> void
CREATE OR REPLACE FUNCTION "public"."cancel_ticket_order"("p_order_id" uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_today date;
  v_order public.ticket_orders%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_order
  FROM public.ticket_orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.user_id <> v_uid AND NOT private.can_manage_museum(v_order.museum_id) THEN
    RAISE EXCEPTION 'not_owner_or_admin';
  END IF;

  IF v_order.status <> 'confirmed'::public.ticket_order_status THEN
    RAISE EXCEPTION 'order_not_cancellable';
  END IF;

  v_today := (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date;
  IF v_order.visit_date <= v_today THEN
    RAISE EXCEPTION 'visit_date_passed';
  END IF;

  UPDATE public.ticket_orders
  SET status = 'cancelled'::public.ticket_order_status
  WHERE id = v_order.id;
END;
$$;--> statement-breakpoint

-- 6. cancel_shop_order(p_order_id) -> void
CREATE OR REPLACE FUNCTION "public"."cancel_shop_order"("p_order_id" uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid;
  v_order public.shop_orders%ROWTYPE;
  v_item record;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO v_order
  FROM public.shop_orders o
  WHERE o.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order_not_found';
  END IF;

  IF v_order.user_id <> v_uid AND NOT private.can_manage_museum(v_order.museum_id) THEN
    RAISE EXCEPTION 'not_owner_or_admin';
  END IF;

  IF v_order.status IN ('shipped'::public.shop_order_status, 'completed'::public.shop_order_status) THEN
    RAISE EXCEPTION 'already_shipped';
  END IF;

  IF v_order.status <> 'confirmed'::public.shop_order_status THEN
    RAISE EXCEPTION 'order_not_cancellable';
  END IF;

  -- Lock products in deterministic order before restoring stock
  FOR v_item IN
    SELECT soi.product_id, soi.quantity
    FROM public.shop_order_items soi
    WHERE soi.order_id = v_order.id
    ORDER BY soi.product_id
  LOOP
    UPDATE public.souvenir_products
    SET stock_quantity = stock_quantity + v_item.quantity
    WHERE id = v_item.product_id;
  END LOOP;

  UPDATE public.shop_orders
  SET status = 'cancelled'::public.shop_order_status
  WHERE id = v_order.id;
END;
$$;--> statement-breakpoint

-- Function privileges: revoke from PUBLIC and anon, grant only to authenticated
REVOKE ALL ON FUNCTION "public"."purchase_tickets"(uuid, date, text, jsonb) FROM PUBLIC, "anon";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."purchase_tickets"(uuid, date, text, jsonb) TO "authenticated";--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."checkout_cart"(uuid, jsonb) FROM PUBLIC, "anon";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."checkout_cart"(uuid, jsonb) TO "authenticated";--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."redeem_entry"(text) FROM PUBLIC, "anon";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."redeem_entry"(text) TO "authenticated";--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."update_fulfillment"(uuid, text) FROM PUBLIC, "anon";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."update_fulfillment"(uuid, text) TO "authenticated";--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."cancel_ticket_order"(uuid) FROM PUBLIC, "anon";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."cancel_ticket_order"(uuid) TO "authenticated";--> statement-breakpoint

REVOKE ALL ON FUNCTION "public"."cancel_shop_order"(uuid) FROM PUBLIC, "anon";--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "public"."cancel_shop_order"(uuid) TO "authenticated";

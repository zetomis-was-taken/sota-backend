CREATE TYPE "public"."admin_membership_status" AS ENUM('active', 'suspended', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."app_role" AS ENUM('normal_user', 'admin_user', 'super_admin');--> statement-breakpoint
CREATE TYPE "public"."cart_status" AS ENUM('active', 'converted', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."media_entity_type" AS ENUM('artifact', 'souvenir');--> statement-breakpoint
CREATE TYPE "public"."media_type" AS ENUM('image', 'video');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('unpaid', 'paid', 'failed');--> statement-breakpoint
CREATE TYPE "public"."publication_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."shop_order_status" AS ENUM('pending', 'confirmed', 'shipped', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."ticket_order_status" AS ENUM('pending', 'confirmed', 'used', 'cancelled');--> statement-breakpoint
CREATE SEQUENCE "public"."invoice_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"phone" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role" "app_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_user_id_role_pk" PRIMARY KEY("user_id","role")
);
--> statement-breakpoint
ALTER TABLE "user_roles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "museums" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"address" text,
	"city" text,
	"cover_image_path" text,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "museums_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "museums" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "museum_admins" (
	"museum_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" "admin_membership_status" DEFAULT 'active' NOT NULL,
	"assigned_by" uuid,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "museum_admins_museum_id_user_id_pk" PRIMARY KEY("museum_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "museum_admins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"museum_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"period" text,
	"inventory_code" text,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "artifacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "souvenir_products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"museum_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"sku" text,
	"price" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	"stock_quantity" integer DEFAULT 0 NOT NULL,
	"status" "publication_status" DEFAULT 'draft' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "souvenir_products_price_check" CHECK ("souvenir_products"."price" >= 0),
	CONSTRAINT "souvenir_products_currency_check" CHECK ("souvenir_products"."currency" = 'VND'),
	CONSTRAINT "souvenir_products_stock_quantity_check" CHECK ("souvenir_products"."stock_quantity" >= 0)
);
--> statement-breakpoint
ALTER TABLE "souvenir_products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"museum_id" uuid NOT NULL,
	"entity_type" "media_entity_type" NOT NULL,
	"entity_id" uuid NOT NULL,
	"media_type" "media_type" NOT NULL,
	"storage_bucket" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_assets_storage_bucket_path_key" UNIQUE("storage_bucket","storage_path")
);
--> statement-breakpoint
ALTER TABLE "media_assets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"museum_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	"is_available" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_types_price_check" CHECK ("ticket_types"."price" >= 0),
	CONSTRAINT "ticket_types_currency_check" CHECK ("ticket_types"."currency" = 'VND')
);
--> statement-breakpoint
ALTER TABLE "ticket_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"museum_id" uuid NOT NULL,
	"visit_date" date NOT NULL,
	"time_slot" text NOT NULL,
	"status" "ticket_order_status" DEFAULT 'pending' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	"entry_code" text,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_orders_entry_code_unique" UNIQUE("entry_code"),
	CONSTRAINT "ticket_orders_time_slot_check" CHECK ("ticket_orders"."time_slot" IN ('09:00-11:00', '11:00-13:00', '14:00-16:00', '16:00-18:00')),
	CONSTRAINT "ticket_orders_total_amount_check" CHECK ("ticket_orders"."total_amount" >= 0),
	CONSTRAINT "ticket_orders_currency_check" CHECK ("ticket_orders"."currency" = 'VND')
);
--> statement-breakpoint
ALTER TABLE "ticket_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_order_id" uuid NOT NULL,
	"ticket_type_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"line_total" numeric(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_order_items_quantity_check" CHECK ("ticket_order_items"."quantity" > 0),
	CONSTRAINT "ticket_order_items_unit_price_check" CHECK ("ticket_order_items"."unit_price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "ticket_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "ticket_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_order_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"billing_name" text NOT NULL,
	"billing_email" text NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	CONSTRAINT "ticket_invoices_ticket_order_id_unique" UNIQUE("ticket_order_id"),
	CONSTRAINT "ticket_invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "ticket_invoices_total_amount_check" CHECK ("ticket_invoices"."total_amount" >= 0),
	CONSTRAINT "ticket_invoices_currency_check" CHECK ("ticket_invoices"."currency" = 'VND')
);
--> statement-breakpoint
ALTER TABLE "ticket_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "carts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"museum_id" uuid NOT NULL,
	"status" "cart_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "carts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "cart_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cart_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cart_items_cart_id_product_id_key" UNIQUE("cart_id","product_id"),
	CONSTRAINT "cart_items_quantity_check" CHECK ("cart_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "cart_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shop_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"museum_id" uuid NOT NULL,
	"status" "shop_order_status" DEFAULT 'pending' NOT NULL,
	"payment_status" "payment_status" DEFAULT 'unpaid' NOT NULL,
	"subtotal" numeric(12, 2) NOT NULL,
	"shipping_fee" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_amount" numeric(12, 2) GENERATED ALWAYS AS (subtotal + shipping_fee) STORED NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	"shipping_name" text NOT NULL,
	"shipping_phone" text NOT NULL,
	"shipping_address" text NOT NULL,
	"shipping_city" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_orders_subtotal_check" CHECK ("shop_orders"."subtotal" >= 0),
	CONSTRAINT "shop_orders_shipping_fee_check" CHECK ("shop_orders"."shipping_fee" >= 0),
	CONSTRAINT "shop_orders_currency_check" CHECK ("shop_orders"."currency" = 'VND')
);
--> statement-breakpoint
ALTER TABLE "shop_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shop_order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"quantity" integer NOT NULL,
	"line_total" numeric(12, 2) GENERATED ALWAYS AS (unit_price * quantity) STORED NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_order_items_unit_price_check" CHECK ("shop_order_items"."unit_price" >= 0),
	CONSTRAINT "shop_order_items_quantity_check" CHECK ("shop_order_items"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "shop_order_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "shop_invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"invoice_number" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"billing_name" text NOT NULL,
	"billing_email" text NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"currency" text DEFAULT 'VND' NOT NULL,
	CONSTRAINT "shop_invoices_order_id_unique" UNIQUE("order_id"),
	CONSTRAINT "shop_invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "shop_invoices_total_amount_check" CHECK ("shop_invoices"."total_amount" >= 0),
	CONSTRAINT "shop_invoices_currency_check" CHECK ("shop_invoices"."currency" = 'VND')
);
--> statement-breakpoint
ALTER TABLE "shop_invoices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museums" ADD CONSTRAINT "museums_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museum_admins" ADD CONSTRAINT "museum_admins_museum_id_museums_id_fk" FOREIGN KEY ("museum_id") REFERENCES "public"."museums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museum_admins" ADD CONSTRAINT "museum_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "museum_admins" ADD CONSTRAINT "museum_admins_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_museum_id_museums_id_fk" FOREIGN KEY ("museum_id") REFERENCES "public"."museums"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifacts" ADD CONSTRAINT "artifacts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "souvenir_products" ADD CONSTRAINT "souvenir_products_museum_id_museums_id_fk" FOREIGN KEY ("museum_id") REFERENCES "public"."museums"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "souvenir_products" ADD CONSTRAINT "souvenir_products_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_museum_id_museums_id_fk" FOREIGN KEY ("museum_id") REFERENCES "public"."museums"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_types" ADD CONSTRAINT "ticket_types_museum_id_museums_id_fk" FOREIGN KEY ("museum_id") REFERENCES "public"."museums"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_orders" ADD CONSTRAINT "ticket_orders_museum_id_museums_id_fk" FOREIGN KEY ("museum_id") REFERENCES "public"."museums"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_items" ADD CONSTRAINT "ticket_order_items_ticket_order_id_ticket_orders_id_fk" FOREIGN KEY ("ticket_order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_order_items" ADD CONSTRAINT "ticket_order_items_ticket_type_id_ticket_types_id_fk" FOREIGN KEY ("ticket_type_id") REFERENCES "public"."ticket_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_invoices" ADD CONSTRAINT "ticket_invoices_ticket_order_id_ticket_orders_id_fk" FOREIGN KEY ("ticket_order_id") REFERENCES "public"."ticket_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "carts" ADD CONSTRAINT "carts_museum_id_museums_id_fk" FOREIGN KEY ("museum_id") REFERENCES "public"."museums"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_carts_id_fk" FOREIGN KEY ("cart_id") REFERENCES "public"."carts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_product_id_souvenir_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."souvenir_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_museum_id_museums_id_fk" FOREIGN KEY ("museum_id") REFERENCES "public"."museums"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_items" ADD CONSTRAINT "shop_order_items_product_id_souvenir_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."souvenir_products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_invoices" ADD CONSTRAINT "shop_invoices_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "museums_status_created_at_idx" ON "museums" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "museum_admins_user_id_status_idx" ON "museum_admins" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "artifacts_museum_id_idx" ON "artifacts" USING btree ("museum_id");--> statement-breakpoint
CREATE INDEX "artifacts_museum_id_status_created_at_idx" ON "artifacts" USING btree ("museum_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_museum_id_inventory_code_uidx" ON "artifacts" USING btree ("museum_id","inventory_code") WHERE "artifacts"."inventory_code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "souvenir_products_museum_id_idx" ON "souvenir_products" USING btree ("museum_id");--> statement-breakpoint
CREATE INDEX "souvenir_products_museum_id_status_created_at_idx" ON "souvenir_products" USING btree ("museum_id","status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "souvenir_products_museum_id_sku_uidx" ON "souvenir_products" USING btree ("museum_id","sku") WHERE "souvenir_products"."sku" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "media_assets_primary_entity_uidx" ON "media_assets" USING btree ("entity_type","entity_id") WHERE "media_assets"."is_primary";--> statement-breakpoint
CREATE INDEX "media_assets_museum_entity_sort_idx" ON "media_assets" USING btree ("museum_id","entity_type","entity_id","sort_order");--> statement-breakpoint
CREATE INDEX "ticket_types_museum_id_idx" ON "ticket_types" USING btree ("museum_id");--> statement-breakpoint
CREATE INDEX "ticket_orders_user_id_created_at_idx" ON "ticket_orders" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "ticket_orders_museum_visit_slot_status_idx" ON "ticket_orders" USING btree ("museum_id","visit_date","time_slot","status");--> statement-breakpoint
CREATE INDEX "ticket_order_items_ticket_order_id_idx" ON "ticket_order_items" USING btree ("ticket_order_id");--> statement-breakpoint
CREATE INDEX "ticket_order_items_ticket_type_id_idx" ON "ticket_order_items" USING btree ("ticket_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "carts_active_user_museum_uidx" ON "carts" USING btree ("user_id","museum_id") WHERE "carts"."status" = 'active';--> statement-breakpoint
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items" USING btree ("cart_id");--> statement-breakpoint
CREATE INDEX "cart_items_product_id_idx" ON "cart_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "shop_orders_user_id_created_at_idx" ON "shop_orders" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "shop_orders_museum_id_created_at_idx" ON "shop_orders" USING btree ("museum_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "shop_order_items_order_id_idx" ON "shop_order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "shop_order_items_product_id_idx" ON "shop_order_items" USING btree ("product_id");
ALTER TABLE "artifacts" ADD COLUMN "source_system" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "source_url" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "source_rights" text;--> statement-breakpoint
ALTER TABLE "artifacts" ADD COLUMN "source_credit" text;--> statement-breakpoint
CREATE UNIQUE INDEX "artifacts_source_system_source_id_uidx" ON "artifacts" USING btree ("source_system","source_id") WHERE "artifacts"."source_system" IS NOT NULL AND "artifacts"."source_id" IS NOT NULL;
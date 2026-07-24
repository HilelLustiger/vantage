CREATE TABLE IF NOT EXISTS "cash_flows" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"asset_id" text NOT NULL,
	"document_id" text NOT NULL,
	"date" date NOT NULL,
	"amount" numeric NOT NULL,
	"currency" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"running_balance_after" numeric
);
--> statement-breakpoint
ALTER TABLE "assets" ADD COLUMN "security_number" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "cash_flows" ADD CONSTRAINT "cash_flows_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "cash_flows_asset_date_idx" ON "cash_flows" USING btree ("asset_id","date");
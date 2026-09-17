CREATE TABLE IF NOT EXISTS "document_pending_reviews" (
	"document_id" text PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_pending_reviews" ADD CONSTRAINT "document_pending_reviews_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN IF EXISTS "parsed_lines";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN IF EXISTS "locally_confirmed";--> statement-breakpoint
ALTER TABLE "documents" DROP COLUMN IF EXISTS "validity_failed_checks";
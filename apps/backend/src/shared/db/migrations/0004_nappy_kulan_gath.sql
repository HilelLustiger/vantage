ALTER TABLE "documents" ADD COLUMN "parsed_data" json;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "failure_reason" text;
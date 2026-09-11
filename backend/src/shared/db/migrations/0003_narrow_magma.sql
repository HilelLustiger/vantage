ALTER TABLE "documents" ADD COLUMN "format" text DEFAULT 'pdf' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "feature" text DEFAULT 'investments' NOT NULL;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "date_range_start" date;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "date_range_end" date;
CREATE TABLE IF NOT EXISTS "fx_rates" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text NOT NULL,
	"rate" numeric NOT NULL,
	CONSTRAINT "fx_rates_date_from_currency_to_currency_unique" UNIQUE("date","from_currency","to_currency")
);

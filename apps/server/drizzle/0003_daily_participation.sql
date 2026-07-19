CREATE TABLE "daily_participation" (
	"account_id" uuid NOT NULL,
	"daily_date" date NOT NULL,
	"run_id" text NOT NULL,
	"contract_id" text NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_participation_account_id_daily_date_pk" PRIMARY KEY("account_id","daily_date")
);
--> statement-breakpoint
ALTER TABLE "daily_participation" ADD CONSTRAINT "daily_participation_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "applied_round_results" (
	"account_id" uuid NOT NULL,
	"run_id" text NOT NULL,
	"round" integer NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "applied_round_results_account_id_run_id_round_pk" PRIMARY KEY("account_id","run_id","round")
);
--> statement-breakpoint
ALTER TABLE "applied_round_results" ADD CONSTRAINT "applied_round_results_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;
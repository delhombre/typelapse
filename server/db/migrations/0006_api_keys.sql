CREATE TABLE "api_keys" (
	"prefix" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"secret_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	CONSTRAINT "api_keys_prefix_format_check" CHECK ("api_keys"."prefix" ~ '^tlk_[0-9a-f]{8}$'),
	CONSTRAINT "api_keys_name_check" CHECK (char_length("api_keys"."name") BETWEEN 1 AND 60 AND "api_keys"."name" = btrim("api_keys"."name")),
	CONSTRAINT "api_keys_secret_hash_check" CHECK ("api_keys"."secret_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "api_keys_expiry_check" CHECK ("api_keys"."expires_at" IS NULL OR "api_keys"."expires_at" > "api_keys"."created_at")
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_owner_created_idx" ON "api_keys" USING btree ("owner_id","created_at");
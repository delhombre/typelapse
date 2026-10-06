-- Billing moved from Stripe to Polar (merchant of record), so nothing in the schema names a provider.
-- Renames only: no row is rewritten, so a database that already holds a projection keeps it.
-- Every rename is guarded by the old name still existing, so a replay on a migrated database is a no-op.
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace ns ON ns.oid = t.typnamespace WHERE ns.nspname = 'public' AND t.typname = 'stripe_subscription_status') THEN ALTER TYPE "public"."stripe_subscription_status" RENAME TO "billing_subscription_status"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace ns ON ns.oid = t.typnamespace WHERE ns.nspname = 'public' AND t.typname = 'stripe_webhook_event_status') THEN ALTER TYPE "public"."stripe_webhook_event_status" RENAME TO "billing_webhook_event_status"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF to_regclass('public.stripe_webhook_events') IS NOT NULL THEN ALTER TABLE "stripe_webhook_events" RENAME TO "billing_webhook_events"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'billing_webhook_events' AND column_name = 'stripe_created_at') THEN ALTER TABLE "billing_webhook_events" RENAME COLUMN "stripe_created_at" TO "provider_created_at"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_webhook_events_pkey' AND conrelid = to_regclass('public.billing_webhook_events')) THEN ALTER TABLE "billing_webhook_events" RENAME CONSTRAINT "stripe_webhook_events_pkey" TO "billing_webhook_events_pkey"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_webhook_events_attempts_check' AND conrelid = to_regclass('public.billing_webhook_events')) THEN ALTER TABLE "billing_webhook_events" RENAME CONSTRAINT "stripe_webhook_events_attempts_check" TO "billing_webhook_events_attempts_check"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_webhook_events_payload_hash_check' AND conrelid = to_regclass('public.billing_webhook_events')) THEN ALTER TABLE "billing_webhook_events" RENAME CONSTRAINT "stripe_webhook_events_payload_hash_check" TO "billing_webhook_events_payload_hash_check"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stripe_webhook_events_outcome_check' AND conrelid = to_regclass('public.billing_webhook_events')) THEN ALTER TABLE "billing_webhook_events" RENAME CONSTRAINT "stripe_webhook_events_outcome_check" TO "billing_webhook_events_outcome_check"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF to_regclass('public.stripe_webhook_events_status_received_idx') IS NOT NULL THEN ALTER INDEX "stripe_webhook_events_status_received_idx" RENAME TO "billing_webhook_events_status_received_idx"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_projections' AND column_name = 'stripe_status') THEN ALTER TABLE "subscription_projections" RENAME COLUMN "stripe_status" TO "provider_status"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_projections' AND column_name = 'stripe_customer_id') THEN ALTER TABLE "subscription_projections" RENAME COLUMN "stripe_customer_id" TO "provider_customer_id"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_projections' AND column_name = 'stripe_subscription_id') THEN ALTER TABLE "subscription_projections" RENAME COLUMN "stripe_subscription_id" TO "provider_subscription_id"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'subscription_projections' AND column_name = 'stripe_price_id') THEN ALTER TABLE "subscription_projections" RENAME COLUMN "stripe_price_id" TO "provider_product_id"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF to_regclass('public.subscription_projections_stripe_customer_unique') IS NOT NULL THEN ALTER INDEX "subscription_projections_stripe_customer_unique" RENAME TO "subscription_projections_provider_customer_unique"; END IF; END $$;
--> statement-breakpoint
DO $$ BEGIN IF to_regclass('public.subscription_projections_stripe_subscription_unique') IS NOT NULL THEN ALTER INDEX "subscription_projections_stripe_subscription_unique" RENAME TO "subscription_projections_provider_subscription_unique"; END IF; END $$;

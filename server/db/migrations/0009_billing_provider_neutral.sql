-- Billing moved from Stripe to Polar (merchant of record), so nothing in the schema names a provider.
-- Renames only: no row is rewritten, so a database that already holds a projection keeps it.
ALTER TYPE "public"."stripe_subscription_status" RENAME TO "billing_subscription_status";--> statement-breakpoint
ALTER TYPE "public"."stripe_webhook_event_status" RENAME TO "billing_webhook_event_status";--> statement-breakpoint
ALTER TABLE "stripe_webhook_events" RENAME TO "billing_webhook_events";--> statement-breakpoint
ALTER TABLE "billing_webhook_events" RENAME COLUMN "stripe_created_at" TO "provider_created_at";--> statement-breakpoint
ALTER TABLE "billing_webhook_events" RENAME CONSTRAINT "stripe_webhook_events_pkey" TO "billing_webhook_events_pkey";--> statement-breakpoint
ALTER TABLE "billing_webhook_events" RENAME CONSTRAINT "stripe_webhook_events_attempts_check" TO "billing_webhook_events_attempts_check";--> statement-breakpoint
ALTER TABLE "billing_webhook_events" RENAME CONSTRAINT "stripe_webhook_events_payload_hash_check" TO "billing_webhook_events_payload_hash_check";--> statement-breakpoint
ALTER TABLE "billing_webhook_events" RENAME CONSTRAINT "stripe_webhook_events_outcome_check" TO "billing_webhook_events_outcome_check";--> statement-breakpoint
ALTER INDEX "stripe_webhook_events_status_received_idx" RENAME TO "billing_webhook_events_status_received_idx";--> statement-breakpoint
ALTER TABLE "subscription_projections" RENAME COLUMN "stripe_status" TO "provider_status";--> statement-breakpoint
ALTER TABLE "subscription_projections" RENAME COLUMN "stripe_customer_id" TO "provider_customer_id";--> statement-breakpoint
ALTER TABLE "subscription_projections" RENAME COLUMN "stripe_subscription_id" TO "provider_subscription_id";--> statement-breakpoint
ALTER TABLE "subscription_projections" RENAME COLUMN "stripe_price_id" TO "provider_product_id";--> statement-breakpoint
ALTER INDEX "subscription_projections_stripe_customer_unique" RENAME TO "subscription_projections_provider_customer_unique";--> statement-breakpoint
ALTER INDEX "subscription_projections_stripe_subscription_unique" RENAME TO "subscription_projections_provider_subscription_unique";

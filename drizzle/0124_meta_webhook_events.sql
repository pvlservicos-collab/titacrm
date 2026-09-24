-- Eventos crus do webhook da Meta (WhatsApp Cloud / Instagram), gravados antes
-- de interpretar. Ver src/app/api/webhooks/facebook/route.ts.
CREATE TABLE IF NOT EXISTS "meta_webhook_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "received_at" timestamp with time zone DEFAULT now() NOT NULL,
  "object" text,
  "payload" jsonb NOT NULL,
  "status" text NOT NULL,
  "processed_at" timestamp with time zone,
  "error" text
);
CREATE INDEX IF NOT EXISTS "meta_webhook_events_received_at_idx" ON "meta_webhook_events" ("received_at");

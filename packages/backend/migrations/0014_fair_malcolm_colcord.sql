ALTER TABLE "integrations" ADD COLUMN "sync_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE integrations i SET sync_revision=COALESCE((SELECT max(s.revision) FROM calendar_snapshots s WHERE s.integration_id=i.id),0) WHERE i.type='termihub';

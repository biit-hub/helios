CREATE TABLE "auth_account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_limits" (
	"id" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"reset_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_flows" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"trusted" boolean DEFAULT false NOT NULL,
	"return_to" text DEFAULT '/' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_identity_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"recovery_acknowledged_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "auth_session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "auth_session_policy" (
	"session_id" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"trusted" boolean DEFAULT false NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"mfa_at" timestamp with time zone,
	"step_up_at" timestamp with time zone,
	"device" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_totp_uses" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"failed_verification_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	CONSTRAINT "auth_two_factor_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "auth_user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"username" text,
	"display_username" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"singleton" boolean DEFAULT true NOT NULL,
	CONSTRAINT "auth_user_email_unique" UNIQUE("email"),
	CONSTRAINT "auth_user_username_unique" UNIQUE("username"),
	CONSTRAINT "auth_singleton_true" CHECK ("auth_user"."singleton"=true)
);
--> statement-breakpoint
CREATE TABLE "auth_verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_account" ADD CONSTRAINT "auth_account_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_flows" ADD CONSTRAINT "auth_flows_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_identity_state" ADD CONSTRAINT "auth_identity_state_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session" ADD CONSTRAINT "auth_session_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_session_policy" ADD CONSTRAINT "auth_session_policy_session_id_auth_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."auth_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_two_factor" ADD CONSTRAINT "auth_two_factor_user_id_auth_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."auth_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_credential_identity" ON "auth_account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "auth_account_user" ON "auth_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "auth_session_user" ON "auth_session" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_single_user" ON "auth_user" USING btree ("singleton");--> statement-breakpoint
CREATE INDEX "auth_verification_identifier" ON "auth_verification" USING btree ("identifier");
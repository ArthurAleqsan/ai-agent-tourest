CREATE TABLE `activity_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`action` text NOT NULL,
	`actor` text DEFAULT 'system' NOT NULL,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_logs_entity_idx` ON `activity_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `activity_logs_created_at_idx` ON `activity_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_name` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`started_at` text,
	`finished_at` text,
	`items_processed` integer DEFAULT 0 NOT NULL,
	`error` text,
	`metadata` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `job_runs_job_name_idx` ON `job_runs` (`job_name`);--> statement-breakpoint
CREATE INDEX `job_runs_status_idx` ON `job_runs` (`status`);--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`source_item_id` text NOT NULL,
	`display_name` text,
	`contact_handle` text,
	`preferred_channel` text,
	`region` text,
	`destination_interest` text,
	`lifecycle_status` text DEFAULT 'new' NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`contact_permission_status` text DEFAULT 'not_contactable' NOT NULL,
	`dedupe_key` text NOT NULL,
	`retention_expires_at` text,
	`notes` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_item_id`) REFERENCES `source_items`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_dedupe_key_unique` ON `leads` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `leads_lifecycle_idx` ON `leads` (`lifecycle_status`);--> statement-breakpoint
CREATE INDEX `leads_approval_idx` ON `leads` (`approval_status`);--> statement-breakpoint
CREATE TABLE `message_drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`tour_match_id` text,
	`channel` text DEFAULT 'manual' NOT NULL,
	`language` text DEFAULT 'en' NOT NULL,
	`subject` text,
	`body` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`approval_status` text DEFAULT 'pending' NOT NULL,
	`approved_by` text,
	`approved_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tour_match_id`) REFERENCES `tour_matches`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `message_drafts_lead_idx` ON `message_drafts` (`lead_id`);--> statement-breakpoint
CREATE INDEX `message_drafts_status_idx` ON `message_drafts` (`status`);--> statement-breakpoint
CREATE TABLE `qualifications` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`intent_level` text DEFAULT 'none' NOT NULL,
	`intent_score` real DEFAULT 0 NOT NULL,
	`destination` text,
	`travel_window` text,
	`party_size` integer,
	`budget_hint` text,
	`rationale` text,
	`model` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `qualifications_lead_idx` ON `qualifications` (`lead_id`);--> statement-breakpoint
CREATE TABLE `source_items` (
	`id` text PRIMARY KEY NOT NULL,
	`source_id` text NOT NULL,
	`external_id` text,
	`url` text,
	`raw_content` text NOT NULL,
	`content_hash` text NOT NULL,
	`dedupe_key` text NOT NULL,
	`language` text,
	`access_permission_status` text DEFAULT 'unknown' NOT NULL,
	`is_authorized_message` integer DEFAULT false NOT NULL,
	`collected_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`retention_expires_at` text,
	`processed_at` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`source_id`) REFERENCES `sources`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `source_items_dedupe_key_unique` ON `source_items` (`dedupe_key`);--> statement-breakpoint
CREATE INDEX `source_items_source_idx` ON `source_items` (`source_id`);--> statement-breakpoint
CREATE INDEX `source_items_collected_at_idx` ON `source_items` (`collected_at`);--> statement-breakpoint
CREATE TABLE `sources` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`url` text,
	`description` text,
	`access_permission_status` text DEFAULT 'unknown' NOT NULL,
	`is_enabled` integer DEFAULT true NOT NULL,
	`retention_days` integer DEFAULT 90 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sources_type_idx` ON `sources` (`type`);--> statement-breakpoint
CREATE TABLE `tour_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`lead_id` text NOT NULL,
	`tour_id` text NOT NULL,
	`score` real DEFAULT 0 NOT NULL,
	`rank` integer DEFAULT 0 NOT NULL,
	`rationale` text,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tour_id`) REFERENCES `tours`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tour_matches_lead_tour_unique` ON `tour_matches` (`lead_id`,`tour_id`);--> statement-breakpoint
CREATE INDEX `tour_matches_lead_idx` ON `tour_matches` (`lead_id`);--> statement-breakpoint
CREATE TABLE `tours` (
	`id` text PRIMARY KEY NOT NULL,
	`external_id` text,
	`slug` text,
	`title` text NOT NULL,
	`destination` text NOT NULL,
	`country` text NOT NULL,
	`category` text,
	`duration_hours` real,
	`price_from` real,
	`currency` text,
	`url` text,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tours_external_id_unique` ON `tours` (`external_id`);--> statement-breakpoint
CREATE INDEX `tours_destination_idx` ON `tours` (`destination`);
CREATE TABLE `abuse_report` (
	`id` text PRIMARY KEY NOT NULL,
	`reported_token` text,
	`reported_artifact_id` text,
	`reason` text NOT NULL,
	`details` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`handled_at` integer
);
--> statement-breakpoint
CREATE TABLE `abuse_signature` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern` text NOT NULL,
	`note` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

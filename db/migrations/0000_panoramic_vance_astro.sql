CREATE TABLE `artifact` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`title` text NOT NULL,
	`storage_key` text NOT NULL,
	`content_type` text NOT NULL,
	`slide_count` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `comment` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`viewer_session_id` text,
	`author_label` text NOT NULL,
	`slide_index` integer,
	`body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `share`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`viewer_session_id`) REFERENCES `viewer_session`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `event` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`viewer_session_id` text,
	`type` text NOT NULL,
	`slide_index` integer,
	`duration_ms` integer,
	`metadata` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`share_id`) REFERENCES `share`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`viewer_session_id`) REFERENCES `viewer_session`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `event_share_id_idx` ON `event` (`share_id`);--> statement-breakpoint
CREATE TABLE `share` (
	`id` text PRIMARY KEY NOT NULL,
	`artifact_id` text NOT NULL,
	`token` text NOT NULL,
	`mode` text NOT NULL,
	`recipient_label` text,
	`recipient_email` text,
	`password_hash` text,
	`expires_at` integer,
	`revoked_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`artifact_id`) REFERENCES `artifact`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `share_token_unique` ON `share` (`token`);--> statement-breakpoint
CREATE INDEX `share_artifact_id_idx` ON `share` (`artifact_id`);--> statement-breakpoint
CREATE TABLE `viewer_session` (
	`id` text PRIMARY KEY NOT NULL,
	`share_id` text NOT NULL,
	`client_id` text NOT NULL,
	`server_signal_hash` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`last_seen_at` integer,
	FOREIGN KEY (`share_id`) REFERENCES `share`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `viewer_session_share_id_idx` ON `viewer_session` (`share_id`);
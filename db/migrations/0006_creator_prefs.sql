CREATE TABLE `creator_prefs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`notifications_seen_at` integer,
	`email_on_open` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);

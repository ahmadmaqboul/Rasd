CREATE TABLE `ad_variants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`ad_id` integer NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`body` text,
	`title` text,
	`cta` text,
	`link_url` text,
	`data` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`ad_id`) REFERENCES `ads`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ad_variants_ad_position` ON `ad_variants` (`ad_id`,`position`);--> statement-breakpoint
CREATE TABLE `ads` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` integer,
	`platform` text DEFAULT 'meta' NOT NULL,
	`library_id` text NOT NULL,
	`page_name` text,
	`page_external_id` text,
	`is_active` integer,
	`started_at` integer,
	`ended_at` integer,
	`publisher_platforms` text DEFAULT '[]' NOT NULL,
	`variant_count` integer DEFAULT 1 NOT NULL,
	`url` text,
	`data` text DEFAULT '{}' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `tracked_entities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ads_platform_library` ON `ads` (`platform`,`library_id`);--> statement-breakpoint
CREATE INDEX `ads_entity` ON `ads` (`entity_id`);--> statement-breakpoint
CREATE TABLE `alerts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`monitor_id` integer NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`evidence` text DEFAULT '[]' NOT NULL,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`monitor_id`) REFERENCES `monitors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `alerts_monitor` ON `alerts` (`monitor_id`);--> statement-breakpoint
CREATE TABLE `business_products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`profile_id` integer NOT NULL,
	`name` text NOT NULL,
	`our_price` real,
	`cost` real,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `business_profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `business_products_profile` ON `business_products` (`profile_id`);--> statement-breakpoint
CREATE TABLE `business_profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`region` text,
	`currency` text DEFAULT 'ILS' NOT NULL,
	`audience_notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `comment_samples` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer NOT NULL,
	`text` text NOT NULL,
	`text_hash` text NOT NULL,
	`published_at` integer,
	`likes` integer,
	`is_reply` integer DEFAULT false NOT NULL,
	`collected_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `comment_samples_post_hash` ON `comment_samples` (`post_id`,`text_hash`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`progress` text DEFAULT '{}' NOT NULL,
	`result` text,
	`error` text,
	`error_code` text,
	`study_id` integer,
	`lane` text DEFAULT 'default' NOT NULL,
	`cancel_requested` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`heartbeat_at` integer,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `jobs_status` ON `jobs` (`status`,`id`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`post_id` integer,
	`ad_variant_id` integer,
	`listing_id` integer,
	`type` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`file` text NOT NULL,
	`width` integer,
	`height` integer,
	`duration_ms` integer,
	`sha256` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`ad_variant_id`) REFERENCES `ad_variants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`listing_id`) REFERENCES `product_listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `media_post` ON `media` (`post_id`);--> statement-breakpoint
CREATE INDEX `media_ad_variant` ON `media` (`ad_variant_id`);--> statement-breakpoint
CREATE INDEX `media_listing` ON `media` (`listing_id`);--> statement-breakpoint
CREATE TABLE `monitors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`profile_id` integer,
	`template_id` integer,
	`schedule` text NOT NULL,
	`triggers` text DEFAULT '[]' NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`last_run_at` integer,
	`next_run_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `business_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `platform_sessions` (
	`platform` text PRIMARY KEY NOT NULL,
	`status` text DEFAULT 'missing' NOT NULL,
	`label` text,
	`last_login_at` integer,
	`last_checked_at` integer,
	`expires_at` integer,
	`message` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` integer NOT NULL,
	`platform` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text NOT NULL,
	`kind` text NOT NULL,
	`caption` text,
	`published_at` integer,
	`likes` integer,
	`comments` integer,
	`views` integer,
	`shares` integer,
	`data` text DEFAULT '{}' NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `tracked_entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_platform_external` ON `posts` (`platform`,`external_id`);--> statement-breakpoint
CREATE INDEX `posts_entity_published` ON `posts` (`entity_id`,`published_at`);--> statement-breakpoint
CREATE TABLE `price_points` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`price` real NOT NULL,
	`original_price` real,
	`currency` text NOT NULL,
	`availability` text DEFAULT 'unknown' NOT NULL,
	`observed_at` integer NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `product_listings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `price_points_listing_observed` ON `price_points` (`listing_id`,`observed_at`);--> statement-breakpoint
CREATE TABLE `product_listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`product_id` integer,
	`entity_id` integer,
	`source_type` text NOT NULL,
	`source_ref` text NOT NULL,
	`title` text NOT NULL,
	`url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`entity_id`) REFERENCES `tracked_entities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `product_listings_source` ON `product_listings` (`source_ref`,`title`);--> statement-breakpoint
CREATE INDEX `product_listings_product` ON `product_listings` (`product_id`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`brand` text,
	`category` text,
	`business_product_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`business_product_id`) REFERENCES `business_products`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_normalized` ON `products` (`normalized_name`);--> statement-breakpoint
CREATE TABLE `profile_entities` (
	`profile_id` integer NOT NULL,
	`entity_id` integer NOT NULL,
	`role` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`profile_id`, `entity_id`),
	FOREIGN KEY (`profile_id`) REFERENCES `business_profiles`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`entity_id`) REFERENCES `tracked_entities`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `profile_entities_entity` ON `profile_entities` (`entity_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`study_id` integer NOT NULL,
	`data` text NOT NULL,
	`notes` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `reports_study_id_unique` ON `reports` (`study_id`);--> statement-breakpoint
CREATE TABLE `session_usage` (
	`platform` text NOT NULL,
	`hour` integer NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`items` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`platform`, `hour`)
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `snapshots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entity_id` integer NOT NULL,
	`run_id` integer,
	`taken_at` integer NOT NULL,
	`followers` integer,
	`following` integer,
	`post_count` integer,
	`data` text DEFAULT '{}' NOT NULL,
	FOREIGN KEY (`entity_id`) REFERENCES `tracked_entities`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`run_id`) REFERENCES `study_runs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `snapshots_entity_taken` ON `snapshots` (`entity_id`,`taken_at`);--> statement-breakpoint
CREATE TABLE `study_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`study_id` integer NOT NULL,
	`status` text DEFAULT 'collecting' NOT NULL,
	`progress` text DEFAULT '{}' NOT NULL,
	`package_path` text,
	`error` text,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `study_runs_study` ON `study_runs` (`study_id`);--> statement-breakpoint
CREATE TABLE `templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`recipe_id` text NOT NULL,
	`profile_id` integer,
	`params` text DEFAULT '{}' NOT NULL,
	`modules` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `business_profiles`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `tracked_entities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`platform` text NOT NULL,
	`handle` text NOT NULL,
	`url` text NOT NULL,
	`display_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracked_entities_platform_handle` ON `tracked_entities` (`platform`,`handle`);--> statement-breakpoint
ALTER TABLE `studies` ADD `profile_id` integer REFERENCES business_profiles(id) ON DELETE set null;--> statement-breakpoint
ALTER TABLE `studies` ADD `template_id` integer REFERENCES templates(id) ON DELETE set null;
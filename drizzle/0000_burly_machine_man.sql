CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`study_id` integer,
	`type` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `events_study` ON `events` (`study_id`);--> statement-breakpoint
CREATE TABLE `findings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`study_id` integer NOT NULL,
	`module` text NOT NULL,
	`key` text NOT NULL,
	`title` text NOT NULL,
	`claim` text NOT NULL,
	`why` text,
	`evidence` text NOT NULL,
	`confidence` text NOT NULL,
	`data` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`study_id`) REFERENCES `studies`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `findings_study_module_key` ON `findings` (`study_id`,`module`,`key`);--> statement-breakpoint
CREATE TABLE `studies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`params` text DEFAULT '{}' NOT NULL,
	`modules` text DEFAULT '[]' NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);

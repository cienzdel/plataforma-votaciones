CREATE TABLE `assent` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`text` text NOT NULL,
	`electorate_filter` text,
	`members` integer NOT NULL,
	`sent_at` integer NOT NULL,
	`closes_at` integer NOT NULL,
	`status` text NOT NULL,
	`record` text,
	`published_at` integer
);
--> statement-breakpoint
CREATE TABLE `assent_objection` (
	`assent_id` text NOT NULL,
	`member_id` text NOT NULL,
	`at` integer NOT NULL,
	`withdrawn_at` integer,
	PRIMARY KEY(`assent_id`, `member_id`),
	FOREIGN KEY (`assent_id`) REFERENCES `assent`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `nominal_vote` (
	`voting_id` text NOT NULL,
	`member_id` text NOT NULL,
	`right` integer NOT NULL,
	`answers` text NOT NULL,
	PRIMARY KEY(`voting_id`, `member_id`, `right`),
	FOREIGN KEY (`voting_id`) REFERENCES `voting`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tie_draw` (
	`id` text PRIMARY KEY NOT NULL,
	`voting_id` text NOT NULL,
	`commitment` text NOT NULL,
	`after` text NOT NULL,
	`round` integer NOT NULL,
	`items` text NOT NULL,
	`spots` integer NOT NULL,
	`document` text,
	`published_at` integer,
	FOREIGN KEY (`voting_id`) REFERENCES `voting`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `voting` ADD `draw_commitment` text;--> statement-breakpoint
ALTER TABLE `voting` ADD `draw_round` integer;--> statement-breakpoint
ALTER TABLE `voting` ADD `manual_tallies` text;--> statement-breakpoint
ALTER TABLE `voting` ADD `manual_received` integer;--> statement-breakpoint
ALTER TABLE `voting` ADD `roll_call` text;
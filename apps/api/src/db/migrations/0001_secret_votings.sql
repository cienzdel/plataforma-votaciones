-- Edited by hand: ballot_received and spent_token are WITHOUT ROWID (ADR-0018), which drizzle-kit cannot express.
CREATE TABLE `ballot_received` (
	`token` text PRIMARY KEY NOT NULL,
	`voting_id` text NOT NULL,
	`sig` text NOT NULL,
	`s` text NOT NULL,
	`answers` text NOT NULL
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `chain_record` (
	`seq` integer PRIMARY KEY NOT NULL,
	`board` text NOT NULL,
	`prev` text NOT NULL,
	`record_hash` text NOT NULL,
	`path` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `electorate_snapshot` (
	`voting_id` text NOT NULL,
	`member_id` text NOT NULL,
	`rights` integer NOT NULL,
	PRIMARY KEY(`voting_id`, `member_id`),
	FOREIGN KEY (`voting_id`) REFERENCES `voting`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `issuance` (
	`voting_id` text NOT NULL,
	`member_id` text NOT NULL,
	`right` integer NOT NULL,
	`blinded_hash` text NOT NULL,
	`blind_sig` text NOT NULL,
	PRIMARY KEY(`voting_id`, `member_id`, `right`),
	FOREIGN KEY (`voting_id`) REFERENCES `voting`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `signing_key` (
	`voting_id` text PRIMARY KEY NOT NULL,
	`public_key` text NOT NULL,
	`private_key` text,
	`destroyed_at` integer,
	FOREIGN KEY (`voting_id`) REFERENCES `voting`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `spent_token` (
	`token` text PRIMARY KEY NOT NULL,
	`voting_id` text NOT NULL
) WITHOUT ROWID;
--> statement-breakpoint
CREATE TABLE `voting` (
	`id` text PRIMARY KEY NOT NULL,
	`meeting_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text NOT NULL,
	`rules` text NOT NULL,
	`rules_hash` text NOT NULL,
	`candidates` text,
	`closes_at` integer,
	`opened_at` integer,
	`closed_at` integer,
	`snapshot_counters` text,
	`quorum` text,
	`opening` text,
	`board` text,
	`annul_reason` text,
	`published_at` integer,
	FOREIGN KEY (`meeting_id`) REFERENCES `meeting`(`id`) ON UPDATE no action ON DELETE no action
);

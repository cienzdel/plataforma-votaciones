-- Edited by hand: pending codes last 10 minutes and the old rows have no request id, so they are dropped, not copied.
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_auth_code` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer NOT NULL,
	`assisted_by` text,
	FOREIGN KEY (`member_id`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assisted_by`) REFERENCES `member`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
DROP TABLE `auth_code`;--> statement-breakpoint
ALTER TABLE `__new_auth_code` RENAME TO `auth_code`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
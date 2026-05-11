CREATE TABLE "tasks" (
	"id" text PRIMARY KEY,
	"title" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"site" text DEFAULT 'all' NOT NULL,
	"category" text NOT NULL,
	"priority" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"deps" text DEFAULT '' NOT NULL,
	"due_date" text DEFAULT '' NOT NULL,
	"task_order" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now()
);

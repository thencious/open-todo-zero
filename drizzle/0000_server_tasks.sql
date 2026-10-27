CREATE TABLE tasks (task_id TEXT PRIMARY KEY NOT NULL, client_id TEXT NOT NULL, title TEXT NOT NULL, notes TEXT NOT NULL, deadline TEXT, ai_state TEXT, ai_error TEXT, ai_input TEXT, ai_result TEXT, payload TEXT NOT NULL, updated_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
--> statement-breakpoint
CREATE TABLE reminder_jobs (task_id TEXT PRIMARY KEY NOT NULL, title TEXT NOT NULL, topic TEXT NOT NULL, timezone TEXT NOT NULL, site_url TEXT NOT NULL, deadline_at INTEGER NOT NULL, estimated_seconds INTEGER NOT NULL, trigger_at INTEGER NOT NULL, signature TEXT NOT NULL, state TEXT NOT NULL, receipt TEXT, last_error TEXT);
--> statement-breakpoint
CREATE TABLE server_runs (id TEXT PRIMARY KEY NOT NULL, ran_at INTEGER NOT NULL, result TEXT NOT NULL);

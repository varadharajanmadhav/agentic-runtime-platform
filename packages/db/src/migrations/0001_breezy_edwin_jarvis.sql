CREATE TABLE "call_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_dir" text NOT NULL,
	"file_path" text NOT NULL,
	"caller_name" varchar(255) NOT NULL,
	"callee_name" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "call_edges_workspace_idx" ON "call_edges" USING btree ("workspace_dir");--> statement-breakpoint
CREATE INDEX "call_edges_file_idx" ON "call_edges" USING btree ("file_path");--> statement-breakpoint
CREATE INDEX "call_edges_caller_idx" ON "call_edges" USING btree ("caller_name");--> statement-breakpoint
CREATE INDEX "call_edges_callee_idx" ON "call_edges" USING btree ("callee_name");
CREATE TABLE "user_unfollowed_series" (
	"user_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_unfollowed_series_user_id_series_id_pk" PRIMARY KEY("user_id","series_id")
);
--> statement-breakpoint
ALTER TABLE "user_unfollowed_series" ADD CONSTRAINT "user_unfollowed_series_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_unfollowed_series" ADD CONSTRAINT "user_unfollowed_series_series_id_book_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."book_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_unfollowed_series_series_idx" ON "user_unfollowed_series" USING btree ("series_id");
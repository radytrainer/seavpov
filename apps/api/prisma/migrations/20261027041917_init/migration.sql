-- CreateEnum
CREATE TYPE "Role" AS ENUM ('STUDENT', 'TRAINER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'OTHER', 'UNDISCLOSED');

-- CreateEnum
CREATE TYPE "CatalogStatus" AS ENUM ('APPROVED', 'PENDING');

-- CreateEnum
CREATE TYPE "ReadingStatus" AS ENUM ('PLANNED', 'READING', 'PAUSED', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('READING', 'PAUSED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SessionSource" AS ENUM ('TIMER', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReadingMethod" AS ENUM ('PHYSICAL_BOOK');

-- CreateTable
CREATE TABLE "generations" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "start_year" INTEGER,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "generations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "generation_id" UUID NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role" "Role" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "username" VARCHAR(64) NOT NULL,
    "email" VARCHAR(254),
    "student_code" VARCHAR(32),
    "full_name" VARCHAR(150) NOT NULL,
    "gender" "Gender",
    "class_id" UUID,
    "password_hash" TEXT NOT NULL,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" VARCHAR(64),
    "user_agent" VARCHAR(300),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "used_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trainer_student_assignments" (
    "id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trainer_student_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_categories" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "book_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_books" (
    "id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "author" VARCHAR(200),
    "normalized_key" VARCHAR(510) NOT NULL,
    "category_id" UUID,
    "isbn" VARCHAR(20),
    "library_code" VARCHAR(50),
    "total_pages" INTEGER,
    "cover_image_url" VARCHAR(500),
    "status" "CatalogStatus" NOT NULL DEFAULT 'APPROVED',
    "created_by_id" UUID,
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "library_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_books" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "library_book_id" UUID NOT NULL,
    "status" "ReadingStatus" NOT NULL DEFAULT 'PLANNED',
    "current_page" INTEGER NOT NULL DEFAULT 0,
    "total_pages" INTEGER,
    "notes" VARCHAR(2000),
    "started_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "last_read_at" TIMESTAMPTZ(3),
    "archived_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "student_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_sessions" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "student_book_id" UUID NOT NULL,
    "source" "SessionSource" NOT NULL DEFAULT 'TIMER',
    "method" "ReadingMethod" NOT NULL DEFAULT 'PHYSICAL_BOOK',
    "status" "SessionStatus" NOT NULL,
    "started_at" TIMESTAMPTZ(3) NOT NULL,
    "ended_at" TIMESTAMPTZ(3),
    "last_resumed_at" TIMESTAMPTZ(3),
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "duration_capped" BOOLEAN NOT NULL DEFAULT false,
    "reading_date" DATE NOT NULL,
    "start_page" INTEGER,
    "end_page" INTEGER,
    "note" VARCHAR(2000),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reading_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_reflections" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "what_read" VARCHAR(4000),
    "learned" VARCHAR(4000),
    "key_ideas" VARCHAR(4000),
    "application" VARCHAR(4000),
    "key_takeaway" VARCHAR(500),
    "understanding_rating" SMALLINT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reading_reflections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reflection_tags" (
    "id" UUID NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reflection_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reflection_tag_assignments" (
    "reflection_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,

    CONSTRAINT "reflection_tag_assignments_pkey" PRIMARY KEY ("reflection_id","tag_id")
);

-- CreateTable
CREATE TABLE "trainer_feedback" (
    "id" UUID NOT NULL,
    "reflection_id" UUID NOT NULL,
    "trainer_id" UUID NOT NULL,
    "body" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trainer_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reading_goals" (
    "id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "daily_minutes" INTEGER NOT NULL,
    "weekly_minutes" INTEGER NOT NULL,
    "days_per_week" SMALLINT NOT NULL,
    "monthly_books" SMALLINT,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reading_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "institution_name" VARCHAR(150) NOT NULL DEFAULT 'School Library',
    "time_zone" VARCHAR(64) NOT NULL DEFAULT 'Asia/Phnom_Penh',
    "min_daily_minutes" INTEGER NOT NULL DEFAULT 10,
    "default_daily_minutes" INTEGER NOT NULL DEFAULT 20,
    "default_weekly_minutes" INTEGER NOT NULL DEFAULT 120,
    "default_days_per_week" INTEGER NOT NULL DEFAULT 5,
    "default_monthly_books" INTEGER DEFAULT 1,
    "max_session_minutes" INTEGER NOT NULL DEFAULT 240,
    "manual_entry_max_days" INTEGER NOT NULL DEFAULT 7,
    "inactive_after_days" INTEGER NOT NULL DEFAULT 7,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "system_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(80) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" VARCHAR(64),
    "metadata" JSONB,
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "generations_name_key" ON "generations"("name");

-- CreateIndex
CREATE UNIQUE INDEX "classes_generation_id_name_key" ON "classes"("generation_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_student_code_key" ON "users"("student_code");

-- CreateIndex
CREATE INDEX "users_role_status_idx" ON "users"("role", "status");

-- CreateIndex
CREATE INDEX "users_class_id_idx" ON "users"("class_id");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_token_hash_key" ON "auth_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE INDEX "auth_sessions_expires_at_idx" ON "auth_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "trainer_student_assignments_student_id_idx" ON "trainer_student_assignments"("student_id");

-- CreateIndex
CREATE UNIQUE INDEX "trainer_student_assignments_trainer_id_student_id_key" ON "trainer_student_assignments"("trainer_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "book_categories_name_key" ON "book_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "library_books_isbn_key" ON "library_books"("isbn");

-- CreateIndex
CREATE UNIQUE INDEX "library_books_library_code_key" ON "library_books"("library_code");

-- CreateIndex
CREATE INDEX "library_books_normalized_key_idx" ON "library_books"("normalized_key");

-- CreateIndex
CREATE INDEX "library_books_category_id_idx" ON "library_books"("category_id");

-- CreateIndex
CREATE INDEX "library_books_status_idx" ON "library_books"("status");

-- CreateIndex
CREATE INDEX "student_books_student_id_status_idx" ON "student_books"("student_id", "status");

-- CreateIndex
CREATE INDEX "student_books_student_id_last_read_at_idx" ON "student_books"("student_id", "last_read_at");

-- CreateIndex
CREATE UNIQUE INDEX "student_books_student_id_library_book_id_key" ON "student_books"("student_id", "library_book_id");

-- CreateIndex
CREATE INDEX "reading_sessions_student_id_reading_date_idx" ON "reading_sessions"("student_id", "reading_date");

-- CreateIndex
CREATE INDEX "reading_sessions_student_id_status_idx" ON "reading_sessions"("student_id", "status");

-- CreateIndex
CREATE INDEX "reading_sessions_student_book_id_idx" ON "reading_sessions"("student_book_id");

-- CreateIndex
CREATE INDEX "reading_sessions_reading_date_idx" ON "reading_sessions"("reading_date");

-- CreateIndex
CREATE UNIQUE INDEX "reading_reflections_session_id_key" ON "reading_reflections"("session_id");

-- CreateIndex
CREATE INDEX "reading_reflections_student_id_created_at_idx" ON "reading_reflections"("student_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "reflection_tags_name_key" ON "reflection_tags"("name");

-- CreateIndex
CREATE INDEX "reflection_tag_assignments_tag_id_idx" ON "reflection_tag_assignments"("tag_id");

-- CreateIndex
CREATE INDEX "trainer_feedback_reflection_id_idx" ON "trainer_feedback"("reflection_id");

-- CreateIndex
CREATE UNIQUE INDEX "reading_goals_student_id_effective_from_key" ON "reading_goals"("student_id", "effective_from");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_generation_id_fkey" FOREIGN KEY ("generation_id") REFERENCES "generations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_student_assignments" ADD CONSTRAINT "trainer_student_assignments_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_student_assignments" ADD CONSTRAINT "trainer_student_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "book_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_books" ADD CONSTRAINT "library_books_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_books" ADD CONSTRAINT "student_books_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_books" ADD CONSTRAINT "student_books_library_book_id_fkey" FOREIGN KEY ("library_book_id") REFERENCES "library_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_sessions" ADD CONSTRAINT "reading_sessions_student_book_id_fkey" FOREIGN KEY ("student_book_id") REFERENCES "student_books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_reflections" ADD CONSTRAINT "reading_reflections_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "reading_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_reflections" ADD CONSTRAINT "reading_reflections_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflection_tag_assignments" ADD CONSTRAINT "reflection_tag_assignments_reflection_id_fkey" FOREIGN KEY ("reflection_id") REFERENCES "reading_reflections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reflection_tag_assignments" ADD CONSTRAINT "reflection_tag_assignments_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "reflection_tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_feedback" ADD CONSTRAINT "trainer_feedback_reflection_id_fkey" FOREIGN KEY ("reflection_id") REFERENCES "reading_reflections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trainer_feedback" ADD CONSTRAINT "trainer_feedback_trainer_id_fkey" FOREIGN KEY ("trainer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reading_goals" ADD CONSTRAINT "reading_goals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Constraints not expressible in the Prisma schema
-- ---------------------------------------------------------------------------

-- At most one active (READING/PAUSED) session per student. Concurrent "start" requests
-- race on this index, so only one can succeed.
CREATE UNIQUE INDEX "reading_sessions_one_active_per_student"
  ON "reading_sessions" ("student_id")
  WHERE "status" IN ('READING', 'PAUSED');

ALTER TABLE "reading_sessions"
  ADD CONSTRAINT "reading_sessions_duration_nonnegative" CHECK ("duration_seconds" >= 0),
  ADD CONSTRAINT "reading_sessions_pages_valid" CHECK (
    ("start_page" IS NULL OR "start_page" >= 0) AND
    ("end_page" IS NULL OR "end_page" >= 0) AND
    ("start_page" IS NULL OR "end_page" IS NULL OR "end_page" >= "start_page")
  ),
  ADD CONSTRAINT "reading_sessions_end_after_start" CHECK ("ended_at" IS NULL OR "ended_at" >= "started_at"),
  ADD CONSTRAINT "reading_sessions_completed_has_end" CHECK (
    "status" NOT IN ('COMPLETED', 'CANCELLED') OR "ended_at" IS NOT NULL
  ),
  ADD CONSTRAINT "reading_sessions_running_has_resume" CHECK (
    ("status" = 'READING') = ("last_resumed_at" IS NOT NULL)
  );

ALTER TABLE "student_books"
  ADD CONSTRAINT "student_books_current_page_nonnegative" CHECK ("current_page" >= 0),
  ADD CONSTRAINT "student_books_total_pages_positive" CHECK ("total_pages" IS NULL OR "total_pages" > 0);

ALTER TABLE "library_books"
  ADD CONSTRAINT "library_books_total_pages_positive" CHECK ("total_pages" IS NULL OR "total_pages" > 0);

ALTER TABLE "reading_reflections"
  ADD CONSTRAINT "reading_reflections_rating_range" CHECK (
    "understanding_rating" IS NULL OR "understanding_rating" BETWEEN 1 AND 5
  );

ALTER TABLE "reading_goals"
  ADD CONSTRAINT "reading_goals_values_valid" CHECK (
    "daily_minutes" BETWEEN 0 AND 1440 AND
    "weekly_minutes" BETWEEN 0 AND 10080 AND
    "days_per_week" BETWEEN 0 AND 7 AND
    ("monthly_books" IS NULL OR "monthly_books" BETWEEN 0 AND 100)
  );

ALTER TABLE "system_settings"
  ADD CONSTRAINT "system_settings_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "system_settings_values_valid" CHECK (
    "min_daily_minutes" BETWEEN 1 AND 600 AND
    "max_session_minutes" BETWEEN 10 AND 1440 AND
    "manual_entry_max_days" BETWEEN 0 AND 365 AND
    "inactive_after_days" BETWEEN 1 AND 365
  );

ALTER TABLE "trainer_student_assignments"
  ADD CONSTRAINT "trainer_student_assignments_distinct" CHECK ("trainer_id" <> "student_id");

-- Singleton settings row with defaults.
INSERT INTO "system_settings" ("id", "updated_at") VALUES (1, CURRENT_TIMESTAMP);

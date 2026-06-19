-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('open', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "Availability" AS ENUM ('available', 'maybe', 'unavailable');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('poll_completed');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('queued', 'sent', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" BIGSERIAL NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(120),
    "token_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_tokens" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "request_ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_sessions" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "refresh_token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "user_agent" VARCHAR(255),
    "ip" VARCHAR(45),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "polls" (
    "id" BIGSERIAL NOT NULL,
    "user_id" BIGINT NOT NULL,
    "public_token" CHAR(22) NOT NULL,
    "title" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "timezone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "status" "PollStatus" NOT NULL DEFAULT 'open',
    "final_slot_id" BIGINT,
    "closes_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_dates" (
    "id" BIGSERIAL NOT NULL,
    "poll_id" BIGINT NOT NULL,
    "event_date" DATE NOT NULL,
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidated_at" TIMESTAMP(3),

    CONSTRAINT "poll_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_slots" (
    "id" BIGSERIAL NOT NULL,
    "poll_date_id" BIGINT NOT NULL,
    "start_time" TIME,
    "end_time" TIME,
    "is_all_day" BOOLEAN NOT NULL DEFAULT false,
    "label" VARCHAR(120),
    "sort_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invalidated_at" TIMESTAMP(3),

    CONSTRAINT "poll_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" BIGSERIAL NOT NULL,
    "poll_id" BIGINT NOT NULL,
    "public_token" CHAR(22) NOT NULL,
    "display_name" VARCHAR(120) NOT NULL,
    "email" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" BIGSERIAL NOT NULL,
    "participant_id" BIGINT NOT NULL,
    "poll_slot_id" BIGINT NOT NULL,
    "availability" "Availability" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "slot_tallies" (
    "poll_slot_id" BIGINT NOT NULL,
    "available_count" INTEGER NOT NULL DEFAULT 0,
    "maybe_count" INTEGER NOT NULL DEFAULT 0,
    "unavailable_count" INTEGER NOT NULL DEFAULT 0,
    "score" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "slot_tallies_pkey" PRIMARY KEY ("poll_slot_id")
);

-- CreateTable
CREATE TABLE "email_log" (
    "id" BIGSERIAL NOT NULL,
    "poll_id" BIGINT NOT NULL,
    "participant_id" BIGINT NOT NULL,
    "type" "EmailType" NOT NULL,
    "to_email" VARCHAR(255) NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'queued',
    "error" VARCHAR(500),
    "sent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "login_tokens_token_hash_key" ON "login_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "login_tokens_user_id_idx" ON "login_tokens"("user_id");

-- CreateIndex
CREATE INDEX "login_tokens_expires_at_idx" ON "login_tokens"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "auth_sessions_refresh_token_hash_key" ON "auth_sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "auth_sessions_user_id_idx" ON "auth_sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "polls_public_token_key" ON "polls"("public_token");

-- CreateIndex
CREATE INDEX "polls_user_id_idx" ON "polls"("user_id");

-- CreateIndex
CREATE INDEX "polls_status_idx" ON "polls"("status");

-- CreateIndex
CREATE INDEX "poll_dates_poll_id_idx" ON "poll_dates"("poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_dates_poll_id_event_date_key" ON "poll_dates"("poll_id", "event_date");

-- CreateIndex
CREATE INDEX "poll_slots_poll_date_id_idx" ON "poll_slots"("poll_date_id");

-- CreateIndex
CREATE UNIQUE INDEX "participants_public_token_key" ON "participants"("public_token");

-- CreateIndex
CREATE INDEX "participants_poll_id_idx" ON "participants"("poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "participants_poll_id_email_key" ON "participants"("poll_id", "email");

-- CreateIndex
CREATE INDEX "responses_poll_slot_id_idx" ON "responses"("poll_slot_id");

-- CreateIndex
CREATE UNIQUE INDEX "responses_participant_id_poll_slot_id_key" ON "responses"("participant_id", "poll_slot_id");

-- CreateIndex
CREATE INDEX "email_log_poll_id_idx" ON "email_log"("poll_id");

-- CreateIndex
CREATE UNIQUE INDEX "email_log_poll_id_participant_id_type_key" ON "email_log"("poll_id", "participant_id", "type");

-- AddForeignKey
ALTER TABLE "login_tokens" ADD CONSTRAINT "login_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_final_slot_id_fkey" FOREIGN KEY ("final_slot_id") REFERENCES "poll_slots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_dates" ADD CONSTRAINT "poll_dates_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_slots" ADD CONSTRAINT "poll_slots_poll_date_id_fkey" FOREIGN KEY ("poll_date_id") REFERENCES "poll_dates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_poll_slot_id_fkey" FOREIGN KEY ("poll_slot_id") REFERENCES "poll_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "slot_tallies" ADD CONSTRAINT "slot_tallies_poll_slot_id_fkey" FOREIGN KEY ("poll_slot_id") REFERENCES "poll_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_log" ADD CONSTRAINT "email_log_participant_id_fkey" FOREIGN KEY ("participant_id") REFERENCES "participants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

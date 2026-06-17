-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(120) NULL,
    `token_version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `login_tokens` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `consumed_at` DATETIME(3) NULL,
    `request_ip` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `login_tokens_token_hash_key`(`token_hash`),
    INDEX `login_tokens_user_id_idx`(`user_id`),
    INDEX `login_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_sessions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `refresh_token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `user_agent` VARCHAR(255) NULL,
    `ip` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `auth_sessions_refresh_token_hash_key`(`refresh_token_hash`),
    INDEX `auth_sessions_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `polls` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NOT NULL,
    `public_token` CHAR(22) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `description` VARCHAR(1000) NULL,
    `timezone` VARCHAR(64) NOT NULL DEFAULT 'UTC',
    `status` ENUM('open', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
    `final_slot_id` BIGINT NULL,
    `closes_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `polls_public_token_key`(`public_token`),
    INDEX `polls_user_id_idx`(`user_id`),
    INDEX `polls_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `poll_dates` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `poll_id` BIGINT NOT NULL,
    `event_date` DATE NOT NULL,
    `sort_order` SMALLINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `poll_dates_poll_id_idx`(`poll_id`),
    UNIQUE INDEX `poll_dates_poll_id_event_date_key`(`poll_id`, `event_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `poll_slots` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `poll_date_id` BIGINT NOT NULL,
    `start_time` TIME NULL,
    `end_time` TIME NULL,
    `is_all_day` BOOLEAN NOT NULL DEFAULT false,
    `label` VARCHAR(120) NULL,
    `sort_order` SMALLINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `poll_slots_poll_date_id_idx`(`poll_date_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `participants` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `poll_id` BIGINT NOT NULL,
    `public_token` CHAR(22) NOT NULL,
    `display_name` VARCHAR(120) NOT NULL,
    `email` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `participants_public_token_key`(`public_token`),
    INDEX `participants_poll_id_idx`(`poll_id`),
    UNIQUE INDEX `participants_poll_id_email_key`(`poll_id`, `email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `responses` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `participant_id` BIGINT NOT NULL,
    `poll_slot_id` BIGINT NOT NULL,
    `availability` ENUM('available', 'maybe', 'unavailable') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `responses_poll_slot_id_idx`(`poll_slot_id`),
    UNIQUE INDEX `responses_participant_id_poll_slot_id_key`(`participant_id`, `poll_slot_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `slot_tallies` (
    `poll_slot_id` BIGINT NOT NULL,
    `available_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `maybe_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `unavailable_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `score` INTEGER NOT NULL DEFAULT 0,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`poll_slot_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_log` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `poll_id` BIGINT NOT NULL,
    `participant_id` BIGINT NOT NULL,
    `type` ENUM('poll_completed') NOT NULL,
    `to_email` VARCHAR(255) NOT NULL,
    `status` ENUM('queued', 'sent', 'failed') NOT NULL DEFAULT 'queued',
    `error` VARCHAR(500) NULL,
    `sent_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `email_log_poll_id_idx`(`poll_id`),
    UNIQUE INDEX `email_log_poll_id_participant_id_type_key`(`poll_id`, `participant_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `login_tokens` ADD CONSTRAINT `login_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `auth_sessions` ADD CONSTRAINT `auth_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `polls` ADD CONSTRAINT `polls_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `polls` ADD CONSTRAINT `polls_final_slot_id_fkey` FOREIGN KEY (`final_slot_id`) REFERENCES `poll_slots`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poll_dates` ADD CONSTRAINT `poll_dates_poll_id_fkey` FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `poll_slots` ADD CONSTRAINT `poll_slots_poll_date_id_fkey` FOREIGN KEY (`poll_date_id`) REFERENCES `poll_dates`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `participants` ADD CONSTRAINT `participants_poll_id_fkey` FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `responses` ADD CONSTRAINT `responses_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `responses` ADD CONSTRAINT `responses_poll_slot_id_fkey` FOREIGN KEY (`poll_slot_id`) REFERENCES `poll_slots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `slot_tallies` ADD CONSTRAINT `slot_tallies_poll_slot_id_fkey` FOREIGN KEY (`poll_slot_id`) REFERENCES `poll_slots`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_log` ADD CONSTRAINT `email_log_poll_id_fkey` FOREIGN KEY (`poll_id`) REFERENCES `polls`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `email_log` ADD CONSTRAINT `email_log_participant_id_fkey` FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

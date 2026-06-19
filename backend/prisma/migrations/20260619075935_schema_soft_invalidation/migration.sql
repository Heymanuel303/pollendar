-- AlterTable
ALTER TABLE `poll_dates` ADD COLUMN `invalidated_at` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `poll_slots` ADD COLUMN `invalidated_at` DATETIME(3) NULL;

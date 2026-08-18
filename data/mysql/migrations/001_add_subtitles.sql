-- Migration 001 — add the `subtitles` table.
--
-- This is safe to run against an existing Localflix database: it only adds
-- a new table and does not touch `movie`, `series`, or `episodes`, or any
-- existing rows in them.
--
-- Usage (existing install, run once):
--   docker compose exec db mysql -uroot -p localflix < data/mysql/migrations/001_add_subtitles.sql
-- or, if running MySQL outside Docker:
--   mysql -u root -p localflix < data/mysql/migrations/001_add_subtitles.sql
--
-- A fresh install applies this automatically as part of schema.sql and does
-- NOT need to run this file separately.

CREATE TABLE IF NOT EXISTS `subtitles` (
  `id` int NOT NULL AUTO_INCREMENT,
  `media_type` enum('movie','episode') NOT NULL,
  `media_id` varchar(255) NOT NULL,
  `language` varchar(50) NOT NULL DEFAULT 'und',
  `original_filename` varchar(255) DEFAULT NULL,
  `storage_path` varchar(500) NOT NULL,
  `format` varchar(10) NOT NULL DEFAULT 'vtt',
  `offset_ms` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_media` (`media_type`,`media_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

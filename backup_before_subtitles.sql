-- MySQL dump 10.13  Distrib 8.3.0, for Linux (x86_64)
--
-- Host: localhost    Database: localflix
-- ------------------------------------------------------
-- Server version	8.3.0

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `episodes`
--

DROP TABLE IF EXISTS `episodes`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `episodes` (
  `identifier` varchar(255) DEFAULT NULL,
  `episode` int DEFAULT NULL,
  `season` int DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `date` date DEFAULT NULL,
  `created_at` datetime DEFAULT NULL,
  `serie_id` varchar(255) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `length_minutes` int DEFAULT NULL,
  KEY `serie_id` (`serie_id`),
  CONSTRAINT `fk_episodes_series` FOREIGN KEY (`serie_id`) REFERENCES `series` (`title`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `episodes`
--

LOCK TABLES `episodes` WRITE;
/*!40000 ALTER TABLE `episodes` DISABLE KEYS */;
/*!40000 ALTER TABLE `episodes` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `movie`
--

DROP TABLE IF EXISTS `movie`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `movie` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(255) NOT NULL,
  `identifier` text,
  `description` text,
  `author` text,
  `length_minutes` int DEFAULT NULL,
  `release_date` date DEFAULT NULL,
  `tags` varchar(255) DEFAULT NULL,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `type` varchar(50) NOT NULL DEFAULT 'movie',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `movie`
--

LOCK TABLES `movie` WRITE;
/*!40000 ALTER TABLE `movie` DISABLE KEYS */;
INSERT INTO `movie` VALUES (12,'house of the dragon 1','e5ace2660af8dc6136616b03ec0c334a','tmpz','th',70,'2025-01-01','tm pp','2026-08-14 19:31:02','2026-08-10 15:52:29','movie'),(13,'Hierarchy','184f65fd4cb7299b5c671a68cda47008','the hierarchy movie','idk',100,'2025-01-01','violence crime','2026-08-10 16:22:28','2026-08-10 16:22:28','movie'),(14,'Hunger game 1','c515d9fa4a7b49f26e0a7ca8db547401','First hunger game movie','idk',142,'2012-01-01','crime distopia horror','2026-08-10 16:54:31','2026-08-10 16:54:31','movie'),(15,'test','a58914e5-a5a0-4e22-987e-f6f51820f080','te','te',0,'2020-01-01','test, movie, test movie, 11','2026-08-13 15:29:14','2026-08-13 15:29:14','movie'),(16,'test3','ac12da77-6d08-40bd-986c-e01bbf740764','tmp','rege',0,'2000-01-01','aldz, eefzd,fsfd, erergeg, erefer, eregef, rfedfefer, egvdfefe, eeeecef, efzefzed, sfsdsdfefd, fd','2026-08-15 21:12:51','2026-08-15 21:12:51','movie');
/*!40000 ALTER TABLE `movie` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `series`
--

DROP TABLE IF EXISTS `series`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `series` (
  `title` varchar(255) NOT NULL,
  `author` varchar(255) DEFAULT NULL,
  `description` text,
  `created_at` datetime DEFAULT CURRENT_TIMESTAMP,
  `number_of_seasons` int DEFAULT '1',
  `release_date` date DEFAULT NULL,
  `tags` varchar(255) DEFAULT NULL,
  `identifier` varchar(255) DEFAULT NULL,
  `type` varchar(50) NOT NULL DEFAULT 'serie',
  PRIMARY KEY (`title`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `series`
--

LOCK TABLES `series` WRITE;
/*!40000 ALTER TABLE `series` DISABLE KEYS */;
/*!40000 ALTER TABLE `series` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-08-18 21:47:47

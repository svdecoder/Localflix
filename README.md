# Localflix
Localflix is a JS based web open source streaming service.

## 📦 Database Storage

To store data about movies and series, we use a **MySQL database** composed of **three different tables**.

---

### 🎬 Table: `movie`

This table contains all information related to movies.

| Field          | Type         | Null | Key | Default           | Extra                                         |
|----------------|--------------|------|-----|-------------------|-----------------------------------------------|
| id             | int          | NO   | PRI | NULL              | auto_increment                                |
| title          | varchar(255) | NO   |     | NULL              |                                               |
| identifier     | text         | YES  |     | NULL              |                                               |
| description    | text         | YES  |     | NULL              |                                               |
| author         | text         | YES  |     | NULL              |                                               |
| length_minutes | int          | YES  |     | NULL              |                                               |
| release_date   | date         | YES  |     | NULL              |                                               |
| tags           | varchar(255) | YES  |     | NULL              |                                               |
| updated_at     | timestamp    | YES  |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED on update CURRENT_TIMESTAMP |
| created_at     | timestamp    | YES  |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED                             |

---

### 📺 Table: `series`

This table contains all the global data relative to a series (author, title, global description, number of seasons, etc.).

| Field             | Type         | Null | Key | Default           | Extra             |
|-------------------|--------------|------|-----|-------------------|-------------------|
| id                | int          | NO   | PRI | NULL              | auto_increment    |
| title             | varchar(255) | NO   |     | NULL              |                   |
| author            | varchar(255) | YES  |     | NULL              |                   |
| description       | text         | YES  |     | NULL              |                   |
| created_at        | datetime     | YES  |     | CURRENT_TIMESTAMP | DEFAULT_GENERATED |
| number_of_seasons | int          | YES  |     | 1                 |                   |

---

### 📖 Table: `episodes`

This table contains all the data relative to specific episodes of a series (description, release date, episode number, specific identifier, etc.).

| Field       | Type         | Null | Key | Default | Extra |
|--------------|--------------|------|-----|---------|-------|
| identifier  | varchar(255) | YES  |     | NULL    |       |
| episode     | int          | YES  |     | NULL    |       |
| season      | int          | YES  |     | NULL    |       |
| description | varchar(255) | YES  |     | NULL    |       |
| date        | date         | YES  |     | NULL    |       |
| created_at  | datetime     | YES  |     | NULL    |       |
| serie_id    | int          | YES  | MUL | NULL    |       |

---

### 🧩 Relationships

- A **series** can have **multiple episodes** (1-to-many relationship between `series` and `episodes` via `serie_id`).
- A **movie** is independent and not linked to the `series` or `episodes` tables.

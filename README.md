## LocalFlix

![Localflix](localflix.png)
A lightweight self-hosted media library for movies and series.

LocalFlix allows you to store, view, and manage your personal video collection with a simple browser interface.
It includes a Node.js backend, HTML/CSS/JS frontend, and MySQL database.

## Features
### Movies
* Add new movies
* Upload video files
* Auto-generated thumbnails
* View movie details
* Integrated video player
### Series
* Add series
* Add episodes per season
* Upload episode videos
* Automatic thumbnail generation
* Episode viewer interface
### Search
* Search movies and series by title, tags, authors or description (by keyword)
### Data Storage
* Files stored locally under /data
* Movie/series metadata stored in MySQL
* Clean directory structure to keep media organized


## Start the server
### Node JS
The project uses node JS to display the pages.
### Server initialization
```
npm install
nano data/mysql/.env #enter the root password and the mysql password (password must be the same)
docker compose up -d
docker cp schema.sql mysql_database:/schema.sql
docker exec -it mysql_database bash
mysql -u root -p -e "CREATE DATABASE localflix;"
mysql -u root -p localflix < schema.sql
```

### Database
The project uses a MySQL database.

Tables included (from schema.sql):
* **movie**
* **series**
* **episodes**

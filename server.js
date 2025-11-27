import express from "express";
import multer from "multer";
const upload = multer({ dest: "data/uploads" });

import path from "path";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import addMovieHandler from "./scripts/addMovie.js";
import vidIdentifiers from "./scripts/index.js";
import getDataMovie from "./scripts/getDataMovie.js";
import getDataSeries from "./scripts/getDataSerie.js";
import getDataEpisodes from "./scripts/getDataEpisodes.js";
import getDataEpisode from "./scripts/getDataEpisode.js"
import search from "./scripts/search.js";
import addSerie from "./scripts/addSerie.js";
import addEpisodeHandler from "./scripts/addEpisode.js";

const app = express();
const PORT = 3000;
const URL = "http://localhost:3000";

app.get("/api/newVideo", async (req, res) => {
  const numberOfVIdeoToDisplay = 5
  var identifiers = await vidIdentifiers(numberOfVIdeoToDisplay);
  res.json(identifiers);
}
);

app.get("/api/dataMovie", async (req, res) => {
  const identifier = req.query.id;
  var datas = await getDataMovie(identifier);
  res.json(datas);
})

app.get("/api/dataEpisode", async (req, res) => {
  const identifier = req.query.id;
  var datas = await getDataEpisode(identifier);
  res.json(datas);
})

app.get("/api/dataSerie", async (req, res) => {
  const title = req.query.title;
  var datas = await getDataSeries(title);
  res.json(datas);
})

app.get("/api/dataEpisodes", async (req, res) => {
  const title = req.query.title;
  const season = req.query.season;
  var datas = await getDataEpisodes(title, season);
  res.json(datas);
})

app.get("/api/search", async (req, res) => {
  const request = req.query.request;
  const specification = req.query.specification;
  var datas = await search(request, specification);
  res.json(datas);
})


app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "index.html"));
});

app.get("/serieDisplay", async (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "serieDisplay.html"))
})

app.get('/viewerM', (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "viewerMovie.html"))
});

app.get('/viewerS', (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "viewerSerie.html"))
});

app.get('/search', (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "search.html"))
});

app.get("/add", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "add.html"))
})
app.get("/add-movie", (req, res) => {
    res.sendFile(path.join(__dirname, "public/html", "add-movie.html"))
});
app.post('/add-movie', upload.single("movie"), (req, res) => {
        res.redirect('/');
    addMovieHandler(req);
});
app.get("/add-serie", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "add-serie.html"))
})
app.post('/add-serie', upload.single("image"), (req, res) => {
    res.redirect('/');
    addSerie(req);
});
app.get("/add-episode", (req, res) => {
  res.sendFile(path.join(__dirname, "public/html", "add-episode.html"))
})
app.post('/add-episode', upload.single("episode"), (req, res) => {
    addEpisodeHandler(req);
    res.redirect('/');
});


app.use("/data/thumbnail", express.static(path.join(__dirname, "data/thumbnail")));
app.use("/data/movie", express.static(path.join(__dirname, "data/movies")));
app.use("/data/serie", express.static(path.join(__dirname, "data/serie")));
app.use("/api/images", express.static(path.join(__dirname, "data/images")));
app.use("/js", express.static(path.join(__dirname, "public/js")));
app.use("/css", express.static(path.join(__dirname, "public/css")));
app.use("/", express.static(path.join(__dirname, "public/html")));
app.use("/data/images/icon.ico", express.static(path.join(__dirname, "/favicon.ico")))

app.listen(PORT, () => {console.log("running")});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

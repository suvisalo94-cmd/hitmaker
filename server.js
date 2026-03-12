require('dotenv').config(); 
const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const app = express();

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/check-auth', (req, res) => {
  res.json({ loggedIn: !!spotifyApi.getAccessToken() });
});

app.get('/login', (req, res) => {
  const scopes = ['playlist-modify-public', 'playlist-modify-private', 'user-read-private'];
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    spotifyApi.setAccessToken(data.body['access_token']);
    res.redirect('/'); 
  } catch (err) {
    res.status(500).send('Login Failed');
  }
});

app.get('/generate-playlist', async (req, res) => {
  // We strictly parse these right at the start
  const genres = req.query.genres;
  const mood = parseFloat(req.query.mood) || 0.5;
  const bpm = req.query.bpm ? parseInt(req.query.bpm) : null;
  const decade = req.query.decade ? parseInt(req.query.decade) : null;

  if (!spotifyApi.getAccessToken()) {
    return res.status(401).json({ success: false, error: "Please login again." });
  }

  try {
    const seedGenres = genres ? genres.split(',').filter(g => g.trim() !== "") : ['pop'];
    let trackUris = [];

    // --- ATTEMPT 1: RECOMMENDATIONS ---
    try {
      const recOptions = {
        seed_genres: seedGenres.slice(0, 5),
        target_valence: mood,
        limit: 20 // Fixed integer
      };
      if (bpm) recOptions.target_tempo = bpm;

      const recData = await spotifyApi.getRecommendations(recOptions);
      trackUris = recData.body.tracks.map(t => t.uri);
    } catch (e) {
      console.log("Rec engine failed or returned nothing.");
    }

    // --- ATTEMPT 2: SEARCH FALLBACK ---
    if (trackUris.length === 0) {
      console.log("Falling back to Search...");
      let q = `genre:${seedGenres[0]}`;
      if (decade) q += ` year:${decade}-${decade + 9}`;
      
      // We pass ONLY the limit to see if it clears the error
      const searchData = await spotifyApi.searchTracks(q, { limit: 20 });
      trackUris = searchData.body.tracks.items.map(t => t.uri);
    }

    if (trackUris.length === 0) {
      return res.status(404).json({ success: false, error: "No tracks found." });
    }

    // --- PLAYLIST CREATION ---
    const me = await spotifyApi.getMe();
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: `AI Mix: ${seedGenres[0].toUpperCase()}`, 
      public: true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- FINAL ERROR LOG ---", JSON.stringify(err, null, 2));
    res.status(err.statusCode || 500).json({ 
        success: false, 
        error: err.body?.error?.message || "Internal Server Error" 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
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
  const scopes = ['playlist-modify-public', 'user-read-private'];
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
  const { genres, mood, bpm } = req.query; // Removed decade temporarily to stabilize

  if (!spotifyApi.getAccessToken()) {
    return res.status(401).json({ success: false, error: "Please login again." });
  }

  try {
    // 1. Force a valid array. Spotify NEEDS at least one seed.
    let seedGenres = genres ? genres.split(',').filter(g => g.trim() !== "") : [];
    if (seedGenres.length === 0) seedGenres = ['pop'];

    // 2. Build the exact object Spotify expects
    // Note: We are using ONLY seed_genres, target_tempo, and target_valence
    const recommendationOptions = {
      seed_genres: seedGenres.slice(0, 5),
      target_valence: parseFloat(mood) || 0.5,
      limit: 20
    };

    // Only add tempo if it's a valid number
    if (bpm && !isNaN(bpm)) {
        recommendationOptions.target_tempo = parseInt(bpm);
    }

    console.log("Attempting Spotify Recommendations with:", recommendationOptions);

    const data = await spotifyApi.getRecommendations(recommendationOptions);
    const tracks = data.body.tracks;

    if (!tracks || tracks.length === 0) {
      return res.status(404).json({ success: false, error: "No tracks found for this vibe." });
    }

    const trackUris = tracks.map(t => t.uri);
    const me = await spotifyApi.getMe();
    
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: `AI Mix: ${seedGenres[0]}`, 
      public: true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- FINAL DEBUG LOG ---");
    console.log("Status Code:", err.statusCode);
    console.log("Error Body:", JSON.stringify(err.body, null, 2));
    
    const msg = err.body?.error?.message || err.message || "Spotify Error";
    res.status(err.statusCode || 500).json({ success: false, error: msg });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
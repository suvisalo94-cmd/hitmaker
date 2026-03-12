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
  const scopes = [
    'playlist-modify-public', 
    'playlist-modify-private', 
    'user-read-private'
  ];
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
  const { genres, mood, bpm, decade } = req.query;

  if (!spotifyApi.getAccessToken()) {
    return res.status(401).json({ success: false, error: "Please login again." });
  }

  try {
    const seedGenres = genres ? genres.split(',').filter(g => g.trim() !== "") : ['pop'];
    let trackUris = [];

    // Ensure numeric values are actual Numbers, not Strings
    const recommendationOptions = {
      seed_genres: seedGenres.slice(0, 5),
      target_valence: parseFloat(mood) || 0.5,
      limit: 20, // Explicitly a number
      market: 'GB' // Adjusted to your current location (UK)
    };

    if (bpm && !isNaN(bpm)) {
      recommendationOptions.target_tempo = Number(bpm);
    }

    try {
      const recData = await spotifyApi.getRecommendations(recommendationOptions);
      trackUris = recData.body.tracks.map(t => t.uri);
    } catch (recErr) {
      console.log("Recommendation failed, searching instead...");
      let searchQuery = `genre:${seedGenres[0]}`;
      if (decade) searchQuery += ` year:${decade}-${Number(decade) + 9}`;
      
      const searchData = await spotifyApi.searchTracks(searchQuery, { limit: 20 });
      trackUris = searchData.body.tracks.items.map(t => t.uri);
    }

    if (trackUris.length === 0) {
      return res.status(404).json({ success: false, error: "No tracks found." });
    }

    const me = await spotifyApi.getMe();
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: `AI Mix: ${seedGenres[0].toUpperCase()}`, 
      public: true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- GENERATION ERROR ---", err);
    res.status(err.statusCode || 500).json({ 
        success: false, 
        error: err.body?.error?.message || "Internal Server Error" 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
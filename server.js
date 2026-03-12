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
  const token = spotifyApi.getAccessToken();
  res.json({ loggedIn: !!token });
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
  const { genres, mood, bpm, decade } = req.query;

  if (!spotifyApi.getAccessToken()) {
    return res.status(401).json({ success: false, error: "Please log in again." });
  }

  try {
    // 1. Setup Base Recommendations (Spotify needs at least 1 genre seed)
    const seedGenres = (genres && genres.length > 0) ? genres.split(',').slice(0, 5) : ['pop'];
    
    const options = {
      seed_genres: seedGenres,
      target_tempo: bpm ? parseInt(bpm) : 120,
      target_valence: parseFloat(mood) || 0.5,
      limit: 20
    };

    // 2. Add Decade Constraints if provided
    // Using min/max year is safer than 'q' search for recommendation endpoints
    if (decade) {
        options.min_year = parseInt(decade);
        options.max_year = parseInt(decade) + 9;
    }

    const recommendations = await spotifyApi.getRecommendations(options);
    const trackUris = recommendations.body.tracks.map(t => t.uri);
    
    if (trackUris.length === 0) {
        return res.status(404).json({ success: false, error: "No songs found for this specific combo. Try a different decade or genre!" });
    }

    // 3. Create and Populate Playlist
    const me = await spotifyApi.getMe();
    const playlistName = `AI Mix: ${seedGenres[0].toUpperCase()} ${decade ? decade + 's' : ''}`;
    
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      'name': playlistName, 
      'description': 'Generated via Hit Maker Pro',
      'public': true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- ERROR DEBUG ---");
    console.log(JSON.stringify(err, null, 2));
    
    let msg = "Spotify Error";
    if (err.statusCode === 404) msg = "Combination too specific. Try removing the decade filter.";
    else if (err.body && err.body.error) msg = err.body.error.message;
    else if (err.message) msg = err.message;
    
    res.status(err.statusCode || 500).json({ success: false, error: String(msg) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
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

// Serve the UI
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Check if server has a token in memory
app.get('/check-auth', (req, res) => {
  const token = spotifyApi.getAccessToken();
  res.json({ loggedIn: !!token });
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
    console.error('Callback Error:', err);
    res.status(500).send('Login Failed. Please go back and try again.');
  }
});

app.get('/generate-playlist', async (req, res) => {
  const { genres, mood } = req.query;

  const token = spotifyApi.getAccessToken();
  if (!token) {
    return res.status(401).json({ success: false, error: "Session expired. Please click 'Connect' again." });
  }

  try {
    const seedGenres = genres ? genres.split(',').slice(0, 5) : ['pop'];
    
    // 1. Get Recommendations
    const recommendations = await spotifyApi.getRecommendations({
      seed_genres: seedGenres,
      target_valence: parseFloat(mood) || 0.5,
      limit: 20
    });

    const trackUris = recommendations.body.tracks.map(t => t.uri);
    if (trackUris.length === 0) throw new Error("No tracks found. Try different genres!");

    // 2. Get User and Create Playlist
    const me = await spotifyApi.getMe();
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      'name': `AI Mix: ${seedGenres.join(' & ')}`, 
      'public': true 
    });
    
    // 3. Add Tracks
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);

    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.error('Generation Error Detail:', err);
    
    // THE ULTIMATE FIX: Extracting the string from the error object
    let errorMessage = "Spotify API Error";
    if (err.body && err.body.error && err.body.error.message) {
        errorMessage = err.body.error.message;
    } else if (err.message) {
        errorMessage = err.message;
    }

    res.status(500).json({ success: false, error: errorMessage });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
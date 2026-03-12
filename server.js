require('dotenv').config(); 
const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const axios = require('axios'); // We'll use axios for a direct call
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
  const { genres, mood, bpm, decade } = req.query;
  const token = spotifyApi.getAccessToken();

  if (!token) {
    return res.status(401).json({ success: false, error: "Please login again." });
  }

  try {
    const seedGenre = genres ? genres.split(',')[0] : 'pop';
    let trackUris = [];

    // --- DIRECT SEARCH CALL (Bypassing the library's limit bug) ---
    console.log(`Searching for: ${seedGenre} in decade: ${decade}`);
    
    let query = `genre:${seedGenre}`;
    if (decade) query += ` year:${decade}-${parseInt(decade) + 9}`;

    const searchResponse = await axios.get('https://api.spotify.com/v1/search', {
      params: {
        q: query,
        type: 'track',
        limit: 20 // Direct number
      },
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    trackUris = searchResponse.data.tracks.items.map(t => t.uri);

    if (trackUris.length === 0) {
      return res.status(404).json({ success: false, error: "No tracks found." });
    }

    // --- PLAYLIST CREATION ---
    const me = await spotifyApi.getMe();
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: `AI Mix: ${seedGenre.toUpperCase()}`, 
      public: true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- ERROR ---", err.response ? err.response.data : err.message);
    res.status(500).json({ 
        success: false, 
        error: "Search failed. Check Render logs for details." 
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
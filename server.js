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

// Serve the frontend
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

// Check if we have an access token
app.get('/check-auth', (req, res) => {
  res.json({ loggedIn: !!spotifyApi.getAccessToken() });
});

// Redirect to Spotify Login
app.get('/login', (req, res) => {
  const scopes = ['playlist-modify-public', 'user-read-private', 'playlist-modify-private'];
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

// Handle the callback from Spotify
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    spotifyApi.setAccessToken(data.body['access_token']);
    res.redirect('/'); 
  } catch (err) { 
    console.error("Login Error:", err);
    res.status(500).send('Login Failed'); 
  }
});

// The core engine
app.get('/generate-playlist', async (req, res) => {
  const token = spotifyApi.getAccessToken();
  if (!token) return res.status(401).json({ success: false, error: "Please reconnect Spotify." });

  // Get genres from the URL query
  const genres = req.query.genres || 'pop';

  try {
    // 1. DIRECT FETCH FOR RECOMMENDATIONS
    // We use the raw URL to avoid the "Invalid Limit" and "Ghost 404" library bugs
    const recUrl = `https://api.spotify.com/v1/recommendations?seed_genres=${encodeURIComponent(genres)}&limit=20`;
    
    const recResponse = await fetch(recUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const recData = await recResponse.json();

    if (recData.error) {
        return res.status(400).json({ success: false, error: recData.error.message });
    }

    if (!recData.tracks || recData.tracks.length === 0) {
      return res.status(404).json({ success: false, error: "No tracks found for these genres." });
    }

    const trackUris = recData.tracks.map(t => t.uri);

    // 2. GET USER ID
    const me = await spotifyApi.getMe();
    const userId = me.body.id;

    // 3. CREATE THE PLAYLIST
    const playlistResponse = await spotifyApi.createPlaylist(userId, { 
      name: `AI Mix: ${genres.toUpperCase()}`, 
      public: true 
    });
    const playlistId = playlistResponse.body.id;
    
    // 4. ADD THE TRACKS
    await spotifyApi.addTracksToPlaylist(playlistId, trackUris);
    
    // Send back the success link
    res.json({ 
        success: true, 
        url: playlistResponse.body.external_urls.spotify 
    });

  } catch (err) {
      console.error("SYSTEM ERROR:", err);
      res.status(500).json({ 
          success: false, 
          error: "Communication error. Try reconnecting your account." 
      });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
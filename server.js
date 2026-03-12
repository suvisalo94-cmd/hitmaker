require('dotenv').config(); 
const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const axios = require('axios'); // Ensure 'npm install axios' was run
const app = express();

const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/check-auth', (req, res) => {
  res.json({ loggedIn: !!spotifyApi.getAccessToken() });
});

app.get('/login', (req, res) => {
  const scopes = ['playlist-modify-public', 'user-read-private', 'playlist-modify-private'];
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

app.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    spotifyApi.setAccessToken(data.body['access_token']);
    res.redirect('/'); 
  } catch (err) { res.status(500).send('Login Failed'); }
});

app.get('/generate-playlist', async (req, res) => {
  const token = spotifyApi.getAccessToken();
  if (!token) return res.status(401).json({ success: false, error: "Reconnect Spotify" });

  try {
    // --- THE HARD-CODED NUCLEAR OPTION ---
    // We are manually building the URL string. 
    // No objects, no library helpers, just a raw HTTP GET request.
    const searchUrl = "https://api.spotify.com/v1/search?q=genre%3Apop&type=track&limit=20";
    
    const searchResponse = await axios.get(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const tracks = searchResponse.data.tracks.items;
    if (!tracks || tracks.length === 0) {
      return res.status(404).json({ success: false, error: "No tracks found" });
    }

    const trackUris = tracks.map(t => t.uri);
    const me = await spotifyApi.getMe();
    
    // Create the playlist
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: "AI Pop Hits", 
      public: true 
    });
    
    // Add tracks
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- DEBUG LOG ---");
    if (err.response) {
        console.log("Status:", err.response.status);
        console.log("Body:", JSON.stringify(err.response.data));
    } else {
        console.log("Error:", err.message);
    }
    res.status(500).json({ success: false, error: "Final attempt failed." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
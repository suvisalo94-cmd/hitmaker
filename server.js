require('dotenv').config(); 
const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const axios = require('axios');
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

// Check auth status
app.get('/check-auth', (req, res) => {
  res.json({ loggedIn: !!spotifyApi.getAccessToken() });
});

// Login
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

// THE FULL FIX FOR GENERATING PLAYLISTS
app.get('/generate-playlist', async (req, res) => {
  const { genres, mood, bpm, decade } = req.query;
  const token = spotifyApi.getAccessToken();

  if (!token) {
    return res.status(401).json({ success: false, error: "Please login again." });
  }

  try {
    const seedGenre = genres ? genres.split(',')[0] : 'pop';
    
    // BUILD SEARCH QUERY
    let query = `genre:${seedGenre}`;
    if (decade && decade !== "") {
        query += ` year:${decade}-${parseInt(decade) + 9}`;
    }

    // RAW URL to bypass the "Invalid Limit" library bug
    const encodedQuery = encodeURIComponent(query);
    const rawUrl = `https://api.spotify.com/v1/search?q=${encodedQuery}&type=track&limit=20`;
    
    console.log("Calling Raw URL:", rawUrl);

    const searchResponse = await axios.get(rawUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const trackUris = searchResponse.data.tracks.items.map(t => t.uri);

    if (trackUris.length === 0) {
      return res.status(404).json({ success: false, error: "No tracks found." });
    }

    // CREATE PLAYLIST
    const me = await spotifyApi.getMe();
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: `AI Mix: ${seedGenre.toUpperCase()}`, 
      public: true 
    });
    
    // ADD TRACKS
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- API ERROR ---");
    if (err.response) {
        console.log("Status:", err.response.status);
        console.log("Body:", JSON.stringify(err.response.data, null, 2));
    } else {
        console.log("Message:", err.message);
    }
    res.status(500).json({ success: false, error: "Communication error with Spotify." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
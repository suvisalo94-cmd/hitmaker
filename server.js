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

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.get('/check-auth', (req, res) => res.json({ loggedIn: !!spotifyApi.getAccessToken() }));

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
  if (!token) return res.status(401).json({ success: false, error: "Please reconnect Spotify." });

  const { genres, decade } = req.query;
  const seedGenre = genres ? genres.split(',')[0] : 'pop';

  try {
    // 1. BUILD THE SEARCH QUERY
    let q = `genre:${seedGenre}`;
    if (decade) q += ` year:${decade}-${parseInt(decade) + 9}`;

    // 2. THE RAW AXIOS CALL (Using the CORRECT Spotify URL)
    console.log(`Searching for: ${q}`);
    
    const response = await axios.get('https://api.spotify.com/v1/search', {
      params: {
        q: q,
        type: 'track',
        limit: 20
      },
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const trackUris = response.data.tracks.items.map(t => t.uri);

    if (trackUris.length === 0) {
      return res.status(404).json({ success: false, error: "No songs found for that genre/decade." });
    }

    // 3. CREATE PLAYLIST
    const me = await spotifyApi.getMe();
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: `AI Success Mix: ${seedGenre.toUpperCase()}`, 
      public: true 
    });
    
    // 4. ADD TRACKS
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- ERROR LOG ---");
    if (err.response) {
        console.log("Status:", err.response.status);
        console.log("Data:", err.response.data);
    } else {
        console.log(err.message);
    }
    res.status(500).json({ success: false, error: "Communication failed. Try clicking Connect again." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
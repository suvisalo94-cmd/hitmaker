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
  } catch (err) { 
    res.status(500).send('Login Failed'); 
  }
});

app.get('/generate-playlist', async (req, res) => {
  const token = spotifyApi.getAccessToken();
  if (!token) return res.status(401).json({ success: false, error: "Please reconnect Spotify." });

  const genres = req.query.genres || 'pop';

  try {
    // FIX: Changed to HTTPS and added manual limit/seed formatting
    const recUrl = `https://api.spotify.com/v1/recommendations?seed_genres=${encodeURIComponent(genres)}&limit=20`;
    
    const recResponse = await fetch(recUrl, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    // Safety check: Don't parse if the response is empty or failed
    if (!recResponse.ok) {
        const errorText = await recResponse.text();
        console.error("Spotify API Error:", errorText);
        return res.status(recResponse.status).json({ success: false, error: "Spotify rejected the request." });
    }

    const recData = await recResponse.json();

    if (!recData.tracks || recData.tracks.length === 0) {
      return res.status(404).json({ success: false, error: "No tracks found for these genres." });
    }

    const trackUris = recData.tracks.map(t => t.uri);
    const me = await spotifyApi.getMe();
    
    const playlistResponse = await spotifyApi.createPlaylist(me.body.id, { 
      name: `AI Mix: ${genres.toUpperCase()}`, 
      public: true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlistResponse.body.id, trackUris);
    
    res.json({ success: true, url: playlistResponse.body.external_urls.spotify });

  } catch (err) {
      console.error("CRITICAL ERROR:", err);
      res.status(500).json({ success: false, error: "Something went wrong. Check logs." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
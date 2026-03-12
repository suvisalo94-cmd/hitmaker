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
  const scopes = ['playlist-modify-public', 'user-read-private'];
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
  if (!token) return res.status(401).json({ success: false, error: "Please reconnect." });

  const { genres, market } = req.query;
  const genreList = genres ? genres.split(',').filter(g => g.trim() !== "").slice(0, 5) : ['pop'];

  try {
    // We now use the 'market' from the frontend (e.g., 'GB', 'US', 'FR')
    const data = await spotifyApi.getRecommendations({
      seed_genres: genreList,
      limit: 20,
      market: market || 'US' 
    });

    const trackUris = data.body.tracks.map(t => t.uri);
    const me = await spotifyApi.getMe();
    
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: `AI Mix (${market || 'Global'}): ${genreList[0].toUpperCase()}`, 
      public: true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
      console.error("ERROR:", err);
      res.status(500).json({ success: false, error: "Spotify refused the request. Check your market code." });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
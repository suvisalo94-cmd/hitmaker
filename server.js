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
    return res.status(401).json({ success: false, error: "Please login again." });
  }

  try {
    // Safety: ensure we have at least 'pop' as a genre
    const seedGenres = (genres && genres.length > 0) ? genres.split(',').slice(0, 5) : ['pop'];
    
    const recommendations = await spotifyApi.getRecommendations({
      seed_genres: seedGenres,
      target_tempo: bpm || 120,
      target_valence: parseFloat(mood) || 0.5,
      limit: 20
    });

    const trackUris = recommendations.body.tracks.map(t => t.uri);
    const me = await spotifyApi.getMe();
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      'name': `AI Mix: ${seedGenres[0]}`, 
      'public': true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- DETAILED ERROR LOG ---");
    console.log(JSON.stringify(err, null, 2)); // This reveals everything
    
    let msg = "Spotify Error";
    if (err.body && err.body.error) msg = err.body.error.message || JSON.stringify(err.body.error);
    res.status(500).json({ success: false, error: String(msg) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
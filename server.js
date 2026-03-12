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
    res.status(500).send('Login Failed');
  }
});

app.get('/generate-playlist', async (req, res) => {
  const { genres, mood, bpm, decade } = req.query;

  if (!spotifyApi.getAccessToken()) {
    return res.status(401).json({ success: false, error: "Please log in again (Session Expired)." });
  }

  try {
    // 1. Defaults & Multi-Genre Logic
    const seedGenres = genres && genres.length > 0 ? genres.split(',').slice(0, 5) : ['pop'];
    
    // 2. Build Search Query for Decade
    let searchQuery = '';
    if (decade) {
      const startYear = parseInt(decade);
      searchQuery = `year:${startYear}-${startYear + 9}`;
    }

    // 3. Get Recommendations
    const recommendations = await spotifyApi.getRecommendations({
      seed_genres: seedGenres,
      target_tempo: bpm || 120,
      target_valence: parseFloat(mood) || 0.5,
      limit: 20,
      q: searchQuery // This helps filter by year/decade
    });

    const trackUris = recommendations.body.tracks.map(t => t.uri);
    if (trackUris.length === 0) throw new Error("Spotify couldn't find tracks for that combination.");

    // 4. Create Playlist
    const me = await spotifyApi.getMe();
    const playlistName = `AI Mix: ${seedGenres[0]} ${decade ? decade + 's' : ''}`;
    
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      'name': playlistName, 
      'public': true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);

    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.error('Full Error:', err);
    // The "Anti-Object" Fix
    let msg = "Unknown Error";
    if (err.body && err.body.error) msg = err.body.error.message || err.body.error;
    else if (err.message) msg = err.message;

    res.status(500).json({ success: false, error: String(msg) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
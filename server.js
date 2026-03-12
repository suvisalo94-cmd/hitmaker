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
  } catch (err) { res.status(500).send('Login Failed'); }
});

app.get('/generate-playlist', async (req, res) => {
  if (!spotifyApi.getAccessToken()) return res.status(401).json({ success: false, error: "Reconnect Spotify" });

  try {
    // --- STEP 1: SEARCH FOR POP SONGS ---
    // This uses the Search API instead of Recommendations. 
    // It's much more stable and almost never returns a 404/400.
    const searchData = await spotifyApi.searchTracks('genre:pop', { limit: 20 });
    
    const tracks = searchData.body.tracks.items;
    if (!tracks || tracks.length === 0) {
      return res.status(404).json({ success: false, error: "No tracks found" });
    }

    const trackUris = tracks.map(t => t.uri);

    // --- STEP 2: GET USER ID ---
    const me = await spotifyApi.getMe();
    
    // --- STEP 3: CREATE PLAYLIST ---
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: "AI Pop Hits", 
      public: true 
    });
    
    // --- STEP 4: ADD TRACKS ---
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- FINAL DEBUG LOG ---");
    console.log("Status:", err.statusCode);
    console.log("Error Body:", JSON.stringify(err.body));
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
require('dotenv').config(); 
const express = require('express');
const SpotifyWebApi = require('spotify-web-api-node');
const path = require('path');
const app = express();

// Initialize the Spotify API with Environment Variables
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.REDIRECT_URI
});

// Serve the index.html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Step 1: Send user to Spotify login
app.get('/login', (req, res) => {
  const scopes = ['playlist-modify-public', 'user-read-private'];
  res.redirect(spotifyApi.createAuthorizeURL(scopes));
});

// Step 2: Spotify sends user back here with a code
app.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const data = await spotifyApi.authorizationCodeGrant(code);
    spotifyApi.setAccessToken(data.body['access_token']);
    
    // Redirect back to the main page so the user can start generating
    res.redirect('/'); 
  } catch (err) {
    console.error('Login Error:', err);
    res.status(500).send('Error during login: ' + err.message);
  }
});

// Step 3: The Generator Logic
app.get('/generate-playlist', async (req, res) => {
  const { genre, mood, bpm, decade } = req.query;

  // Verify we have a token before trying
  if (!spotifyApi.getAccessToken()) {
    return res.status(401).json({ success: false, error: "Please login with Spotify first!" });
  }

  try {
    // Determine Mood (Valence)
    let targetValence = 0.5;
    if (mood === 'happy') targetValence = 0.8;
    if (mood === 'chill') targetValence = 0.3;

    // 1. Get Recommendations
    const recommendations = await spotifyApi.getRecommendations({
      seed_genres: [genre || 'pop'],
      target_tempo: bpm || 120,
      target_valence: targetValence,
      limit: 20
    });

    const trackUris = recommendations.body.tracks.map(t => t.uri);

    if (trackUris.length === 0) {
      throw new Error("No tracks found for those settings. Try a different genre!");
    }

    // 2. Get the User's ID (Required to create a playlist)
    const me = await spotifyApi.getMe();
    const userId = me.body.id;

    // 3. Create the Playlist
    const playlist = await spotifyApi.createPlaylist(userId, { 
      'name': 'My AI Hits', 
      'description': `Generated ${genre} hits for ${mood} mood`, 
      'public': true 
    });
    
    // 4. Add the Tracks
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);

    // 5. Send the URL back to the frontend
    res.json({ success: true, url: playlist.body.external_urls.spotify });
  } catch (err) {
    console.error('Generation Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
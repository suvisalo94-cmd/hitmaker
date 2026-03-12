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

// 1. Serve the Frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Auth Check for UI
app.get('/check-auth', (req, res) => {
  const token = spotifyApi.getAccessToken();
  res.json({ loggedIn: !!token });
});

// 3. Login Flow
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
    console.error('Login Error:', err);
    res.status(500).send('Login Failed');
  }
});

// 4. THE CORE LOGIC (Fixed for 404 Errors)
app.get('/generate-playlist', async (req, res) => {
  const { genres, mood, bpm, decade } = req.query;

  // Verify Token
  if (!spotifyApi.getAccessToken()) {
    console.log("Error: No access token found in memory.");
    return res.status(401).json({ success: false, error: "Session expired. Please click 'Connect Spotify' again." });
  }

  try {
    // CLEAN GENRES: Filter out empty strings or accidental spaces
    let genreArray = genres ? genres.split(',').map(g => g.trim()).filter(g => g !== "") : [];
    
    // SAFETY FALLBACK: Spotify returns 404 if seed_genres is empty or invalid.
    // If user provided no genre, we MUST provide a valid one.
    if (genreArray.length === 0) {
      console.log("No genres provided by user, falling back to 'pop'");
      genreArray = ['pop'];
    }

    const options = {
      seed_genres: genreArray.slice(0, 5), // Spotify limit is 5
      target_tempo: bpm ? parseInt(bpm) : 120,
      target_valence: parseFloat(mood) || 0.5,
      limit: 20
    };

    // Optional Decade Constraint
    if (decade && decade.trim() !== "") {
        options.min_year = parseInt(decade);
        options.max_year = parseInt(decade) + 9;
    }

    console.log("Requesting recommendations with options:", options);

    const recommendations = await spotifyApi.getRecommendations(options);
    const trackUris = recommendations.body.tracks.map(t => t.uri);
    
    if (trackUris.length === 0) {
        return res.status(404).json({ success: false, error: "Spotify couldn't find songs for this combination. Try a different decade!" });
    }

    // Create and Populate Playlist
    const me = await spotifyApi.getMe();
    const playlistName = `AI Mix: ${genreArray[0].toUpperCase()}`;
    
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      'name': playlistName, 
      'description': 'Generated via Hit Maker Pro',
      'public': true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    
    console.log("Successfully created playlist:", playlist.body.external_urls.spotify);
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- ERROR DEBUG ---");
    // This stringify helps us see the full error in Render Logs
    console.log(JSON.stringify(err, null, 2));
    
    let msg = "Spotify Error";
    if (err.statusCode === 404) {
      msg = "Genre not recognized or no songs found. Try 'pop', 'rock', or 'jazz'.";
    } else if (err.body && err.body.error) {
      msg = err.body.error.message;
    } else {
      msg = err.message || "Unknown server error";
    }
    
    res.status(err.statusCode || 500).json({ success: false, error: String(msg) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
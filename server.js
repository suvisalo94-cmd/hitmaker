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
  if (!token) return res.status(401).json({ success: false, error: "Relogin" });

  try {
    // WE ARE HARD-CODING EVERYTHING TO ELIMINATE VARIABLES
    const searchUrl = 'http://googleusercontent.com/spotify.com/4';
    
    console.log("Calling bare-bones URL...");

    const response = await axios.get(searchUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const trackUris = response.data.tracks.items.map(t => t.uri);
    const me = await spotifyApi.getMe();
    
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: "AI Success Mix", 
      public: true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    console.log("--- ERROR DETAIL ---");
    if (err.response) {
        console.log(err.response.data);
    } else {
        console.log(err.message);
    }
    res.status(500).json({ success: false, error: "Still failing. Check logs." });
  }
});

app.listen(process.env.PORT || 3000);
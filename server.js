app.get('/generate-playlist', async (req, res) => {
  const { genres, mood, bpm, decade } = req.query;
  const token = spotifyApi.getAccessToken();

  if (!token) {
    return res.status(401).json({ success: false, error: "Please login again." });
  }

  try {
    const seedGenre = genres ? genres.split(',')[0] : 'pop';
    
    // THE HARD-CODED FIX: 
    // We are writing the URL exactly as Spotify wants it: limit=20
    let query = `genre:${seedGenre}`;
    if (decade) query += ` year:${decade}-${parseInt(decade) + 9}`;

    const rawUrl = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=20`;
    
    console.log("Calling Raw URL:", rawUrl);

    const searchResponse = await axios.get(rawUrl, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const trackUris = searchResponse.data.tracks.items.map(t => t.uri);

    if (trackUris.length === 0) {
      return res.status(404).json({ success: false, error: "No tracks found." });
    }

    const me = await spotifyApi.getMe();
    const playlist = await spotifyApi.createPlaylist(me.body.id, { 
      name: `AI Mix: ${seedGenre.toUpperCase()}`, 
      public: true 
    });
    
    await spotifyApi.addTracksToPlaylist(playlist.body.id, trackUris);
    res.json({ success: true, url: playlist.body.external_urls.spotify });

  } catch (err) {
    // If it fails, let's see exactly what Spotify says back
    console.log("--- RAW API ERROR ---");
    if (err.response) {
        console.log("Status:", err.response.status);
        console.log("Body:", JSON.stringify(err.response.data, null, 2));
    } else {
        console.log("Message:", err.message);
    }
    res.status(500).json({ success: false, error: "Final attempt failed. Check logs." });
  }
});
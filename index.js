require('dotenv').config();
const express = require('express');
const cors = require('cors');
const NodeCache = require('node-cache');
const path = require('path');

const youtube = require('./server/youtube');
const { scoreCreators } = require('./server/scoring');

const app = express();
const cache = new NodeCache({ stdTTL: 600 }); // 10-minute cache

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Main search endpoint ──────────────────────────────────────────────────────
app.post('/api/search', async (req, res) => {
  const {
    keyword,
    platform = 'youtube',
    min_subscribers,
    max_subscribers,
    min_avg_views,
    max_results = 20,
    api_key,
  } = req.body;

  // Validation
  if (!keyword || keyword.trim().length < 2) {
    return res.status(400).json({ error: 'keyword must be at least 2 characters' });
  }

  const apiKey = api_key || process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: 'YouTube API key is required. Provide it in the request or set YOUTUBE_API_KEY env var.' });
  }

  // Cache key
  const cacheKey = JSON.stringify({ keyword, min_subscribers, max_subscribers, min_avg_views, max_results });
  const cached = cache.get(cacheKey);
  if (cached) {
    return res.json({ ...cached, cached: true });
  }

  try {
    // 1. Search for channels
    const searchResults = await youtube.searchChannels(apiKey, keyword, Math.min(max_results, 50));
    const channelIds = searchResults.map(r => r.id?.channelId).filter(Boolean);

    if (!channelIds.length) {
      return res.json({ creators: [], total: 0, cached: false });
    }

    // 2. Get detailed channel data
    const channels = await youtube.getChannelDetails(apiKey, channelIds);

    // 3. For each channel, fetch recent video performance
    const creatorPromises = channels.map(async (channel) => {
      const stats = channel.statistics || {};
      const subscriberCount = parseInt(stats.subscriberCount || 0, 10);

      // Filter by subscriber range early (saves API quota)
      if (min_subscribers && subscriberCount < parseInt(min_subscribers, 10)) return null;
      if (max_subscribers && subscriberCount > parseInt(max_subscribers, 10)) return null;

      const playlistId = youtube.getUploadsPlaylistId(channel);
      let avgViews = 0;
      let uploadFrequency = null;
      let videoCount = 0;

      if (playlistId) {
        const videoIds = await youtube.getRecentVideos(apiKey, playlistId, 10);
        if (videoIds.length > 0) {
          const videoData = await youtube.getVideoStats(apiKey, videoIds);
          videoCount = videoData.length;

          const totalViews = videoData.reduce((sum, v) => {
            return sum + parseInt(v.statistics?.viewCount || 0, 10);
          }, 0);
          avgViews = videoCount > 0 ? Math.round(totalViews / videoCount) : 0;
          uploadFrequency = youtube.estimateUploadFrequency(videoData);
        }
      }

      // Filter by min avg views
      if (min_avg_views && avgViews < parseInt(min_avg_views, 10)) return null;

      const channelId = channel.id;
      return {
        channel_name: channel.snippet?.title || 'Unknown',
        channel_id: channelId,
        channel_url: `https://www.youtube.com/channel/${channelId}`,
        thumbnail: channel.snippet?.thumbnails?.default?.url || null,
        description: (channel.snippet?.description || '').slice(0, 200),
        subscriber_count: subscriberCount,
        total_views: parseInt(stats.viewCount || 0, 10),
        total_videos: parseInt(stats.videoCount || 0, 10),
        avg_views_last_10_videos: avgViews,
        upload_frequency_estimate: uploadFrequency,
        country: channel.snippet?.country || null,
        // Private fields for scoring
        _keyword: keyword,
        _raw: channel,
      };
    });

    // Wait with concurrency control (batches of 5 to respect rate limits)
    const batchSize = 5;
    const creators = [];
    for (let i = 0; i < creatorPromises.length; i += batchSize) {
      const batch = await Promise.all(creatorPromises.slice(i, i + batchSize));
      creators.push(...batch.filter(Boolean));
    }

    // 4. Score and rank
    const ranked = scoreCreators(creators);

    // Strip internal fields before sending
    const clean = ranked.map(({ _keyword, _raw, ...rest }) => rest);

    const result = { creators: clean, total: clean.length, cached: false };
    cache.set(cacheKey, result);

    return res.json(result);

  } catch (err) {
    console.error('Search error:', err?.response?.data || err.message);
    const apiError = err?.response?.data?.error;
    if (apiError) {
      return res.status(502).json({
        error: `YouTube API error: ${apiError.message}`,
        code: apiError.code,
      });
    }
    return res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
});

// ── Weights info endpoint ─────────────────────────────────────────────────────
app.get('/api/scoring-weights', (req, res) => {
  const { WEIGHTS } = require('./server/scoring');
  res.json(WEIGHTS);
});

// ── Serve frontend ────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Creator Sourcing Engine running at http://localhost:${PORT}`);
  console.log(`   YouTube API Key: ${process.env.YOUTUBE_API_KEY ? '✅ set via env' : '⚠️  not set (provide per-request)'}`);
});

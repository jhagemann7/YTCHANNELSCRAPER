const axios = require('axios');

const BASE_URL = 'https://www.googleapis.com/youtube/v3';

/**
 * Search for channels by keyword
 */
async function searchChannels(apiKey, keyword, maxResults = 25) {
  const res = await axios.get(`${BASE_URL}/search`, {
    params: {
      key: apiKey,
      part: 'snippet',
      type: 'channel',
      q: keyword,
      maxResults,
      order: 'relevance',
    },
  });
  return res.data.items || [];
}

/**
 * Fetch detailed channel statistics for a list of channel IDs
 */
async function getChannelDetails(apiKey, channelIds) {
  if (!channelIds.length) return [];
  const res = await axios.get(`${BASE_URL}/channels`, {
    params: {
      key: apiKey,
      part: 'snippet,statistics,contentDetails',
      id: channelIds.join(','),
      maxResults: 50,
    },
  });
  return res.data.items || [];
}

/**
 * Get the uploads playlist ID for a channel
 */
function getUploadsPlaylistId(channel) {
  return channel?.contentDetails?.relatedPlaylists?.uploads || null;
}

/**
 * Fetch recent videos from a uploads playlist
 */
async function getRecentVideos(apiKey, playlistId, maxResults = 10) {
  try {
    const res = await axios.get(`${BASE_URL}/playlistItems`, {
      params: {
        key: apiKey,
        part: 'contentDetails',
        playlistId,
        maxResults,
      },
    });
    return (res.data.items || []).map(i => i.contentDetails.videoId);
  } catch {
    return [];
  }
}

/**
 * Fetch video statistics for a list of video IDs
 */
async function getVideoStats(apiKey, videoIds) {
  if (!videoIds.length) return [];
  try {
    const res = await axios.get(`${BASE_URL}/videos`, {
      params: {
        key: apiKey,
        part: 'statistics,snippet',
        id: videoIds.join(','),
      },
    });
    return res.data.items || [];
  } catch {
    return [];
  }
}

/**
 * Compute upload frequency estimate (videos per month)
 * by examining publish dates of recent videos
 */
function estimateUploadFrequency(videos) {
  if (videos.length < 2) return null;
  const dates = videos
    .map(v => new Date(v.snippet?.publishedAt))
    .filter(d => !isNaN(d))
    .sort((a, b) => b - a);

  if (dates.length < 2) return null;
  const spanDays = (dates[0] - dates[dates.length - 1]) / (1000 * 60 * 60 * 24);
  if (spanDays === 0) return null;
  const videosPerDay = (dates.length - 1) / spanDays;
  return Math.round(videosPerDay * 30 * 10) / 10; // per month, 1 decimal
}

module.exports = {
  searchChannels,
  getChannelDetails,
  getUploadsPlaylistId,
  getRecentVideos,
  getVideoStats,
  estimateUploadFrequency,
};

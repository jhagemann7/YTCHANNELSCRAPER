# 🔭 CreatorScope — YouTube Creator Sourcing Engine

A full-stack MVP web application that finds, filters, and ranks YouTube creators based on user-defined criteria using the official YouTube Data API v3.

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Get a YouTube Data API v3 key
- Go to [Google Cloud Console](https://console.cloud.google.com/)
- Create a project → Enable **YouTube Data API v3**
- Create an API key under Credentials
- Free tier gives you **10,000 units/day** (a typical search uses ~100–300 units)

### 3. Configure environment (optional)
```bash
cp .env.example .env
# Edit .env and paste your API key
```

Or you can enter the API key directly in the UI per-search (no server restart needed).

### 4. Start the server
```bash
npm start
# → http://localhost:3000
```

---

## 📁 Project Structure

```
creator-sourcing-engine/
├── index.js              # Express server + API routes
├── server/
│   ├── youtube.js        # YouTube API v3 client (all API calls)
│   └── scoring.js        # Creator scoring & ranking logic
├── public/
│   └── index.html        # Frontend UI (self-contained)
├── .env.example          # Environment variable template
└── package.json
```

---

## 🎯 How It Works

### Search Flow
1. User enters a keyword + filters in the UI
2. Backend calls `YouTube Search API` → gets up to 50 channel results
3. Backend calls `YouTube Channels API` → gets full stats for each channel
4. For each channel, calls `PlaylistItems API` → gets last 10 video IDs
5. Calls `Videos API` → gets view counts for each video
6. Applies user filters (subscriber range, min avg views)
7. Scores and ranks remaining channels
8. Returns ranked JSON to frontend

### Scoring Model

| Dimension | Weight | Formula |
|-----------|--------|---------|
| **Niche Match** | 35% | Keyword frequency in title/description/tags (capped at 10 hits → 1.0) |
| **Engagement** | 40% | `avg_views ÷ subscriber_count` (capped at 20% ratio → 1.0) |
| **Consistency** | 25% | Upload frequency in videos/month (capped at 12/mo → 1.0) |

**Final Fit Score** = `0.35 × niche + 0.40 × engagement + 0.25 × consistency` (displayed as 0–100)

---

## 🛠 API Reference

### `POST /api/search`
Search and rank YouTube creators.

**Request body:**
```json
{
  "keyword": "fitness",
  "min_subscribers": 10000,
  "max_subscribers": 1000000,
  "min_avg_views": 5000,
  "max_results": 20,
  "api_key": "AIza..." 
}
```

**Response:**
```json
{
  "creators": [
    {
      "channel_name": "...",
      "channel_id": "...",
      "channel_url": "...",
      "thumbnail": "...",
      "subscriber_count": 125000,
      "total_views": 45000000,
      "avg_views_last_10_videos": 18000,
      "upload_frequency_estimate": 4.5,
      "niche_match_score": 0.8,
      "engagement_score": 0.72,
      "consistency_score": 0.375,
      "final_fit_score": 0.69,
      "ranking_reason": "Strong keyword alignment with 'fitness'; exceptional engagement (~14.4% view/sub ratio); consistent upload cadence (~4.5x/month)."
    }
  ],
  "total": 12,
  "cached": false
}
```

### `GET /api/scoring-weights`
Returns the current scoring weights.

### `GET /api/health`
Health check endpoint.

---

## ⚙️ Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `YOUTUBE_API_KEY` | — | YouTube Data API v3 key (can also be passed per-request) |
| `PORT` | 3000 | HTTP server port |

---

## 💡 Caching

Results are cached in-memory for **10 minutes** per unique search query. Cached responses are indicated with a "CACHED" badge in the UI. This prevents redundant API calls and helps stay within daily quota limits.

---

## 📊 YouTube API Quota Usage

| Operation | Quota Cost |
|-----------|-----------|
| Channel search | 100 units |
| Channel details | 1 unit per 50 channels |
| Playlist items | 1 unit per request |
| Video stats | 1 unit per request |
| **Typical search (20 results)** | ~130–180 units |
| **Daily free quota** | 10,000 units |

You can run approximately **55–75 searches/day** on the free tier.

---

## 🔮 Planned Enhancements (Post-MVP)
- [ ] TikTok & Instagram support
- [ ] Persistent results database (SQLite/Postgres)
- [ ] User authentication & saved searches
- [ ] Advanced scoring weight customization
- [ ] Google Sheets export
- [ ] Email delivery of ranked lists
- [ ] Channel trend tracking over time

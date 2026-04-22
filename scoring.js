/**
 * Scoring Engine for Creator Sourcing
 * All scores normalized to [0, 1] before weighting.
 */

const WEIGHTS = {
  niche: 0.35,
  engagement: 0.40,
  consistency: 0.25,
};

/**
 * Compute niche match score based on keyword frequency in channel metadata.
 * Returns a value between 0 and 1.
 */
function computeNicheScore(keyword, channel) {
  const kw = keyword.toLowerCase().trim();
  const terms = kw.split(/\s+/);

  const fields = [
    channel.snippet?.title || '',
    channel.snippet?.description || '',
    (channel.snippet?.keywords || []).join(' '),
    channel.snippet?.country || '',
  ].join(' ').toLowerCase();

  let hits = 0;
  for (const term of terms) {
    const regex = new RegExp(term, 'gi');
    const matches = fields.match(regex);
    hits += matches ? matches.length : 0;
  }

  // Normalize: cap at 10 hits → score 1.0
  return Math.min(hits / 10, 1.0);
}

/**
 * Compute engagement score: avg_views / subscriber_count.
 * A "good" engagement ratio for YouTube is ~5–15% of subs.
 * We normalize against a ceiling of 0.20 (20%).
 */
function computeEngagementScore(avgViews, subscriberCount) {
  if (!subscriberCount || subscriberCount === 0) return 0;
  const ratio = avgViews / subscriberCount;
  return Math.min(ratio / 0.20, 1.0);
}

/**
 * Compute consistency score from upload frequency (videos/month).
 * Ceiling: 12 videos/month → score 1.0
 */
function computeConsistencyScore(videosPerMonth) {
  if (videosPerMonth === null || videosPerMonth === undefined) return 0.1; // unknown → small default
  return Math.min(videosPerMonth / 12, 1.0);
}

/**
 * Generate a human-readable reason for the ranking.
 */
function generateRankingReason(creator) {
  const parts = [];

  if (creator.niche_match_score >= 0.6) {
    parts.push(`Strong keyword alignment with "${creator._keyword}"`);
  } else if (creator.niche_match_score >= 0.3) {
    parts.push(`Moderate niche relevance`);
  } else {
    parts.push(`Broad topic match`);
  }

  const engPct = Math.round(creator.engagement_score * 20 * 100) / 100;
  if (creator.engagement_score >= 0.7) {
    parts.push(`exceptional engagement (~${engPct}% view/sub ratio)`);
  } else if (creator.engagement_score >= 0.4) {
    parts.push(`solid engagement (~${engPct}% view/sub ratio)`);
  } else {
    parts.push(`below-average engagement (~${engPct}% view/sub ratio)`);
  }

  if (creator.upload_frequency_estimate !== null) {
    const freq = creator.upload_frequency_estimate;
    if (freq >= 8) parts.push(`uploads very frequently (~${freq}x/month)`);
    else if (freq >= 3) parts.push(`consistent upload cadence (~${freq}x/month)`);
    else parts.push(`infrequent uploads (~${freq}x/month)`);
  }

  return parts.join('; ') + '.';
}

/**
 * Score and rank a list of creator objects.
 */
function scoreCreators(creators) {
  const scored = creators.map(c => {
    const nicheScore = computeNicheScore(c._keyword, c._raw);
    const engagementScore = computeEngagementScore(c.avg_views_last_10_videos, c.subscriber_count);
    const consistencyScore = computeConsistencyScore(c.upload_frequency_estimate);

    const finalFitScore =
      WEIGHTS.niche * nicheScore +
      WEIGHTS.engagement * engagementScore +
      WEIGHTS.consistency * consistencyScore;

    return {
      ...c,
      niche_match_score: Math.round(nicheScore * 100) / 100,
      engagement_score: Math.round(engagementScore * 100) / 100,
      consistency_score: Math.round(consistencyScore * 100) / 100,
      final_fit_score: Math.round(finalFitScore * 100) / 100,
    };
  });

  // Add ranking reason after scores are computed
  const withReasons = scored.map(c => ({
    ...c,
    ranking_reason: generateRankingReason(c),
  }));

  return withReasons.sort((a, b) => b.final_fit_score - a.final_fit_score);
}

module.exports = { scoreCreators, WEIGHTS };

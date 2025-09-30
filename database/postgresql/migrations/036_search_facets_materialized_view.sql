-- WP-8: Materialized view for fast faceted search (FIXED for actual schema)
CREATE MATERIALIZED VIEW IF NOT EXISTS search_facets AS
SELECT 
  date_trunc('day', e.starts_at) as event_date,
  v.city,
  v.state,
  CASE 
    WHEN e.min_price < 5000 THEN 'budget'      -- Under $50
    WHEN e.min_price < 15000 THEN 'moderate'   -- $50-150
    WHEN e.min_price >= 15000 THEN 'premium'   -- Over $150
    ELSE 'unknown'
  END as price_range,
  e.category_id,
  e.status,
  COUNT(*) as count
FROM events e
LEFT JOIN venues v ON e.venue_id = v.id
WHERE e.status = 'active'
  AND e.starts_at > NOW()
GROUP BY 1, 2, 3, 4, 5, 6;

-- Indexes for fast refresh
CREATE INDEX IF NOT EXISTS idx_search_facets_date ON search_facets(event_date);
CREATE INDEX IF NOT EXISTS idx_search_facets_city ON search_facets(city);
CREATE INDEX IF NOT EXISTS idx_search_facets_state ON search_facets(state);
CREATE INDEX IF NOT EXISTS idx_search_facets_price ON search_facets(price_range);
CREATE INDEX IF NOT EXISTS idx_search_facets_category ON search_facets(category_id);

-- Function to refresh facets
CREATE OR REPLACE FUNCTION refresh_search_facets()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY search_facets;
END;
$$ LANGUAGE plpgsql;

-- Create the search analytics table that was referenced
CREATE TABLE IF NOT EXISTS search_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query TEXT NOT NULL,
  results_count INTEGER,
  clicked_position INTEGER,
  time_to_click DECIMAL(6,2),
  refined_query TEXT,
  purchased BOOLEAN DEFAULT FALSE,
  zero_results BOOLEAN DEFAULT FALSE,
  session_id UUID,
  user_id UUID REFERENCES users(id),
  venue_context UUID REFERENCES venues(id),
  user_location POINT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_analytics_query ON search_analytics(query);
CREATE INDEX IF NOT EXISTS idx_search_analytics_user ON search_analytics(user_id);
CREATE INDEX IF NOT EXISTS idx_search_analytics_created ON search_analytics(created_at);

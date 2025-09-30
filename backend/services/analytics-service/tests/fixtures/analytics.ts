export const mockRevenueSummary = {
  total: 1000000,
  count: 500,
  average: 2000,
  time_series: [
    { date: '2024-01-01', revenue: 50000 },
    { date: '2024-01-02', revenue: 45000 }
  ]
};

export const mockInsight = {
  id: 'insight-123',
  venue_id: 'venue-456',
  type: 'revenue_opportunity',
  title: 'Pricing Optimization Available',
  description: 'Increase revenue by 15%',
  priority: 'high',
  actions: ['adjust_pricing']
};

export const mockAlert = {
  id: 'alert-123',
  venue_id: 'venue-456',
  name: 'Low Sales Alert',
  condition: { metric: 'sales', operator: '<', threshold: 100 },
  severity: 'warning',
  enabled: true
};

export const mockDashboard = {
  id: 'dash-123',
  name: 'Revenue Dashboard',
  widgets: ['widget-1', 'widget-2'],
  layout: { rows: 2, columns: 2 }
};

export const mockMetric = {
  venue_id: 'venue-456',
  metric_type: 'revenue',
  value: 50000,
  timestamp: '2024-01-01T00:00:00Z'
};

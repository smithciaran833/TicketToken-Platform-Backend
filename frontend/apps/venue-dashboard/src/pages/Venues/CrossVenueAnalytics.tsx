import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Calendar, DollarSign, Ticket, TrendingUp } from "lucide-react";
import { Button } from "../../components/ui";

const venues = [
  { id: 1, name: "The Grand Theater", revenue: 485000, tickets: 12500, events: 24 },
  { id: 2, name: "Riverside Amphitheater", revenue: 320000, tickets: 8900, events: 18 },
  { id: 3, name: "The Jazz Lounge", revenue: 95000, tickets: 3200, events: 42 },
];


export default function CrossVenueAnalytics() {
  const [dateRange, setDateRange] = useState("last_6_months");
  const [selectedVenues, setSelectedVenues] = useState<number[]>([1, 2, 3]);

  const totalRevenue = venues.filter(v => selectedVenues.includes(v.id)).reduce((sum, v) => sum + v.revenue, 0);
  const totalTickets = venues.filter(v => selectedVenues.includes(v.id)).reduce((sum, v) => sum + v.tickets, 0);
  const totalEvents = venues.filter(v => selectedVenues.includes(v.id)).reduce((sum, v) => sum + v.events, 0);

  const toggleVenue = (id: number) => {
    if (selectedVenues.includes(id)) {
      setSelectedVenues(selectedVenues.filter(v => v !== id));
    } else {
      setSelectedVenues([...selectedVenues, id]);
    }
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venues" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Cross-Venue Analytics</h1>
            <p className="text-gray-500">Combined performance across all venues</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Export Report
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg"
            >
              <option value="last_30_days">Last 30 Days</option>
              <option value="last_3_months">Last 3 Months</option>
              <option value="last_6_months">Last 6 Months</option>
              <option value="last_year">Last Year</option>
              <option value="all_time">All Time</option>
            </select>
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Venues</label>
            <div className="flex items-center gap-2">
              {venues.map((venue) => (
                <button
                  key={venue.id}
                  onClick={() => toggleVenue(venue.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedVenues.includes(venue.id)
                      ? "bg-purple-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {venue.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Revenue</p>
              <p className="text-3xl font-bold text-gray-900">${(totalRevenue / 1000).toFixed(0)}k</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tickets Sold</p>
              <p className="text-3xl font-bold text-gray-900">{totalTickets.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Ticket className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Events</p>
              <p className="text-3xl font-bold text-gray-900">{totalEvents}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Ticket Price</p>
              <p className="text-3xl font-bold text-gray-900">${(totalRevenue / totalTickets).toFixed(0)}</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Revenue by Venue Chart Placeholder */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Venue</h2>
          <div className="h-64 flex items-end justify-around gap-4">
            {venues.filter(v => selectedVenues.includes(v.id)).map((venue, idx) => {
              const maxRevenue = Math.max(...venues.map(v => v.revenue));
              const height = (venue.revenue / maxRevenue) * 100;
              const colors = ["bg-purple-500", "bg-blue-500", "bg-green-500"];
              return (
                <div key={venue.id} className="flex flex-col items-center flex-1">
                  <div 
                    className={`w-full ${colors[idx % 3]} rounded-t-lg transition-all`}
                    style={{ height: `${height}%` }}
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center truncate w-full">{venue.name}</p>
                  <p className="text-sm font-semibold text-gray-900">${(venue.revenue / 1000).toFixed(0)}k</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Tickets by Venue</h2>
          <div className="h-64 flex items-end justify-around gap-4">
            {venues.filter(v => selectedVenues.includes(v.id)).map((venue, idx) => {
              const maxTickets = Math.max(...venues.map(v => v.tickets));
              const height = (venue.tickets / maxTickets) * 100;
              const colors = ["bg-purple-500", "bg-blue-500", "bg-green-500"];
              return (
                <div key={venue.id} className="flex flex-col items-center flex-1">
                  <div 
                    className={`w-full ${colors[idx % 3]} rounded-t-lg transition-all`}
                    style={{ height: `${height}%` }}
                  />
                  <p className="text-xs text-gray-500 mt-2 text-center truncate w-full">{venue.name}</p>
                  <p className="text-sm font-semibold text-gray-900">{(venue.tickets / 1000).toFixed(1)}k</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Venue Comparison</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venue</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Events</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Ticket</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rev/Event</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {venues.filter(v => selectedVenues.includes(v.id)).map((venue) => (
              <tr key={venue.id}>
                <td className="px-6 py-4 font-medium text-gray-900">{venue.name}</td>
                <td className="px-6 py-4 text-right text-gray-900">${venue.revenue.toLocaleString()}</td>
                <td className="px-6 py-4 text-right text-gray-900">{venue.tickets.toLocaleString()}</td>
                <td className="px-6 py-4 text-right text-gray-900">{venue.events}</td>
                <td className="px-6 py-4 text-right text-gray-900">${(venue.revenue / venue.tickets).toFixed(2)}</td>
                <td className="px-6 py-4 text-right text-gray-900">${(venue.revenue / venue.events).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-gray-50">
            <tr>
              <td className="px-6 py-3 font-semibold text-gray-900">Total</td>
              <td className="px-6 py-3 text-right font-semibold text-gray-900">${totalRevenue.toLocaleString()}</td>
              <td className="px-6 py-3 text-right font-semibold text-gray-900">{totalTickets.toLocaleString()}</td>
              <td className="px-6 py-3 text-right font-semibold text-gray-900">{totalEvents}</td>
              <td className="px-6 py-3 text-right font-semibold text-gray-900">${(totalRevenue / totalTickets).toFixed(2)}</td>
              <td className="px-6 py-3 text-right font-semibold text-gray-900">${(totalRevenue / totalEvents).toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

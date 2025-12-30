import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, MapPin } from "lucide-react";
import { Button } from "../../components/ui";

const events = [
  { value: "all", label: "All Events" },
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
];

const topCities = [
  { rank: 1, city: "New York", state: "NY", tickets: 423, percent: 15, distance: "12 mi" },
  { rank: 2, city: "Los Angeles", state: "CA", tickets: 312, percent: 11, distance: "2,450 mi" },
  { rank: 3, city: "Chicago", state: "IL", tickets: 245, percent: 9, distance: "790 mi" },
  { rank: 4, city: "Houston", state: "TX", tickets: 189, percent: 7, distance: "1,630 mi" },
  { rank: 5, city: "Phoenix", state: "AZ", tickets: 156, percent: 5, distance: "2,140 mi" },
  { rank: 6, city: "Philadelphia", state: "PA", tickets: 134, percent: 5, distance: "95 mi" },
  { rank: 7, city: "San Antonio", state: "TX", tickets: 112, percent: 4, distance: "1,780 mi" },
  { rank: 8, city: "San Diego", state: "CA", tickets: 98, percent: 3, distance: "2,430 mi" },
  { rank: 9, city: "Dallas", state: "TX", tickets: 87, percent: 3, distance: "1,550 mi" },
  { rank: 10, city: "Boston", state: "MA", tickets: 76, percent: 3, distance: "215 mi" },
];

const distanceStats = {
  avgDistance: 456,
  furthest: { city: "Los Angeles, CA", distance: 2450 },
  localPercent: 42,
  travelPercent: 58,
};

export default function GeographicAnalytics() {
  const [eventFilter, setEventFilter] = useState("all");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/analytics" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Geographic Analytics</h1>
            <p className="text-gray-500">See where your audience comes from</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {events.map(event => (
              <option key={event.value} value={event.value}>{event.label}</option>
            ))}
          </select>
          <Button variant="secondary">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Map Placeholder */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales Heat Map</h2>
        <div className="h-80 bg-gradient-to-br from-gray-100 to-gray-200 rounded-lg flex items-center justify-center relative">
          {/* Simplified US map representation */}
          <div className="relative w-full h-full p-8">
            {/* Heat dots */}
            <div className="absolute top-[30%] right-[15%] w-12 h-12 bg-purple-500/60 rounded-full blur-xl" />
            <div className="absolute top-[35%] left-[10%] w-16 h-16 bg-purple-500/40 rounded-full blur-xl" />
            <div className="absolute top-[40%] left-[40%] w-10 h-10 bg-purple-500/50 rounded-full blur-xl" />
            <div className="absolute top-[55%] left-[30%] w-8 h-8 bg-purple-500/30 rounded-full blur-xl" />
            <div className="absolute top-[50%] left-[15%] w-6 h-6 bg-purple-500/30 rounded-full blur-xl" />
            
            {/* Legend */}
            <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-sm p-3">
              <p className="text-xs font-medium text-gray-700 mb-2">Ticket Sales Density</p>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 bg-purple-200 rounded" />
                <div className="w-4 h-4 bg-purple-400 rounded" />
                <div className="w-4 h-4 bg-purple-600 rounded" />
                <span className="text-xs text-gray-500 ml-1">Low → High</span>
              </div>
            </div>
          </div>
          
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-500 bg-white/80 px-4 py-2 rounded-lg">Interactive map would display here</p>
          </div>
        </div>
      </div>

      {/* Distance Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Average Distance</p>
          <p className="text-3xl font-bold text-gray-900">{distanceStats.avgDistance} mi</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Furthest Customer</p>
          <p className="text-2xl font-bold text-gray-900">{distanceStats.furthest.distance} mi</p>
          <p className="text-sm text-gray-500">{distanceStats.furthest.city}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Local (&lt; 50 mi)</p>
          <p className="text-3xl font-bold text-green-600">{distanceStats.localPercent}%</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Travelers (&gt; 50 mi)</p>
          <p className="text-3xl font-bold text-blue-600">{distanceStats.travelPercent}%</p>
        </div>
      </div>

      {/* Top Cities Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Top Cities</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">City</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Share</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Distance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {topCities.map((city) => (
              <tr key={city.rank} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <span className={`w-6 h-6 inline-flex items-center justify-center rounded-full text-sm font-medium ${
                    city.rank <= 3 ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                  }`}>
                    {city.rank}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="font-medium text-gray-900">{city.city}, {city.state}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right text-gray-900">{city.tickets}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 bg-gray-200 rounded-full">
                      <div className="h-2 bg-purple-500 rounded-full" style={{ width: `${city.percent * 5}%` }} />
                    </div>
                    <span className="text-gray-600 w-8">{city.percent}%</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-right text-gray-600">{city.distance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

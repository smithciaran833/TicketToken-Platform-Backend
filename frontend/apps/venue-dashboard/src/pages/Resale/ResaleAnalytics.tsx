import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, TrendingUp, DollarSign, RefreshCw, ShoppingCart } from "lucide-react";
import { Button } from "../../components/ui";

const dateRanges = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "year", label: "This Year" },
];

const volumeData = [
  { month: "Jan", value: 4200 },
  { month: "Feb", value: 5800 },
  { month: "Mar", value: 7100 },
  { month: "Apr", value: 4900 },
  { month: "May", value: 8200 },
  { month: "Jun", value: 12450 },
];

const topResoldEvents = [
  { name: "Summer Music Festival", listings: 32, sold: 28, volume: 5600, avgMarkup: 35 },
  { name: "Tech Conference", listings: 15, sold: 12, volume: 4500, avgMarkup: 42 },
  { name: "Jazz Night", listings: 8, sold: 7, volume: 840, avgMarkup: 18 },
  { name: "Comedy Night", listings: 5, sold: 5, volume: 375, avgMarkup: 25 },
];

export default function ResaleAnalytics() {
  const [dateRange, setDateRange] = useState("30d");

  const maxVolume = Math.max(...volumeData.map(d => d.value));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/resale" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Resale Analytics</h1>
            <p className="text-gray-500">Track resale activity and royalty earnings</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {dateRanges.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <Button variant="secondary">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Resale Volume</p>
              <p className="text-3xl font-bold text-gray-900">$42,750</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <ShoppingCart className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-green-600 mt-2">↑ 24% vs last period</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Royalties Earned</p>
              <p className="text-3xl font-bold text-green-600">$6,412</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <p className="text-sm text-green-600 mt-2">↑ 18% vs last period</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Average Markup</p>
              <p className="text-3xl font-bold text-yellow-600">+32%</p>
            </div>
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-yellow-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">vs face value</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Sell-Through Rate</p>
              <p className="text-3xl font-bold text-blue-600">87%</p>
            </div>
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-sm text-blue-600 mt-2">↑ 5% vs last period</p>
        </div>
      </div>

      {/* Volume Over Time */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Resale Volume Over Time</h2>
        <div className="h-48 flex items-end justify-between gap-4">
          {volumeData.map((month, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="text-sm font-medium text-gray-600 mb-2">${(month.value / 1000).toFixed(1)}k</div>
              <div 
                className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                style={{ height: `${(month.value / maxVolume) * 140}px` }}
              />
              <span className="text-xs text-gray-500 mt-2">{month.month}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top Resold Events */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Top Resold Events</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Listings</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sold</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Volume</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Markup</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {topResoldEvents.map((event, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">{event.name}</td>
                <td className="px-6 py-4 text-right text-gray-600">{event.listings}</td>
                <td className="px-6 py-4 text-right text-gray-600">{event.sold}</td>
                <td className="px-6 py-4 text-right font-medium text-green-600">${event.volume.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                  <span className={`font-medium ${event.avgMarkup > 40 ? "text-red-600" : event.avgMarkup > 25 ? "text-yellow-600" : "text-green-600"}`}>
                    +{event.avgMarkup}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { TrendingUp, Users, Calendar, DollarSign, BarChart3, PieChart, FileText, MapPin } from "lucide-react";

const dateRanges = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
];

const revenueData = [
  { month: "Jan", value: 12400 },
  { month: "Feb", value: 15800 },
  { month: "Mar", value: 18200 },
  { month: "Apr", value: 22100 },
  { month: "May", value: 19800 },
  { month: "Jun", value: 28500 },
];

const salesByEvent = [
  { name: "Summer Music Festival", tickets: 1432, revenue: 98500 },
  { name: "Tech Conference", tickets: 856, revenue: 256800 },
  { name: "Jazz Night", tickets: 245, revenue: 12250 },
  { name: "Comedy Night", tickets: 312, revenue: 9360 },
];

const topEvents = [
  { id: 1, name: "Tech Conference", date: "Sep 15, 2025", tickets: 856, revenue: 256800, attendance: 94 },
  { id: 2, name: "Summer Music Festival", date: "Jul 15, 2025", tickets: 1432, revenue: 98500, attendance: 89 },
  { id: 3, name: "Art Gallery Opening", date: "Sep 5, 2025", tickets: 175, revenue: 8750, attendance: 100 },
  { id: 4, name: "Jazz Night", date: "Jul 20, 2025", tickets: 245, revenue: 12250, attendance: 92 },
];

export default function AnalyticsDashboard() {
  const [dateRange, setDateRange] = useState("30d");

  const maxRevenue = Math.max(...revenueData.map(d => d.value));
  const maxSales = Math.max(...salesByEvent.map(e => e.tickets));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500">Track performance across all your events</p>
        </div>
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        >
          {dateRanges.map(range => (
            <option key={range.value} value={range.value}>{range.label}</option>
          ))}
        </select>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Revenue</p>
              <p className="text-3xl font-bold text-gray-900">$375,660</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-green-600">18%</span>
            <span className="text-gray-500">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tickets Sold</p>
              <p className="text-3xl font-bold text-gray-900">2,845</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-green-600">12%</span>
            <span className="text-gray-500">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Events Held</p>
              <p className="text-3xl font-bold text-gray-900">12</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            <span className="text-gray-500">4 upcoming</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Attendance</p>
              <p className="text-3xl font-bold text-gray-900">91%</p>
            </div>
            <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-green-600">3%</span>
            <span className="text-gray-500">vs last period</span>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Revenue Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Revenue Over Time</h2>
            <Link to="/venue/analytics/revenue" className="text-sm text-purple-600 hover:text-purple-700">
              View Details
            </Link>
          </div>
          <div className="h-48 flex items-end justify-between gap-3">
            {revenueData.map((point, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div
                  className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                  style={{ height: `${(point.value / maxRevenue) * 160}px` }}
                />
                <span className="text-xs text-gray-500 mt-2">{point.month}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Sales by Event */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Sales by Event</h2>
            <Link to="/venue/analytics/sales" className="text-sm text-purple-600 hover:text-purple-700">
              View Details
            </Link>
          </div>
          <div className="space-y-3">
            {salesByEvent.map((event, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{event.name}</span>
                  <span className="text-sm text-gray-600">{event.tickets} tickets</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full">
                  <div
                    className="h-2 bg-blue-500 rounded-full"
                    style={{ width: `${(event.tickets / maxSales) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Events Table */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Top Performing Events</h2>
          <Link to="/venue/analytics/compare" className="text-sm text-purple-600 hover:text-purple-700">
            Compare Events
          </Link>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets Sold</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Attendance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {topEvents.map((event) => (
              <tr key={event.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900">{event.name}</p>
                  <p className="text-sm text-gray-500">{event.date}</p>
                </td>
                <td className="px-6 py-4 text-right text-gray-900">{event.tickets.toLocaleString()}</td>
                <td className="px-6 py-4 text-right font-medium text-green-600">${event.revenue.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    event.attendance >= 95 ? "bg-green-100 text-green-700" :
                    event.attendance >= 80 ? "bg-yellow-100 text-yellow-700" :
                    "bg-red-100 text-red-700"
                  }`}>
                    {event.attendance}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-4 gap-4">
        <Link to="/venue/analytics/sales" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Sales Analytics</p>
              <p className="text-sm text-gray-500">Ticket sales data</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/analytics/demographics" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <PieChart className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Demographics</p>
              <p className="text-sm text-gray-500">Audience insights</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/analytics/geographic" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Geographic</p>
              <p className="text-sm text-gray-500">Location data</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/analytics/reports" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <FileText className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Custom Reports</p>
              <p className="text-sm text-gray-500">Build & export</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

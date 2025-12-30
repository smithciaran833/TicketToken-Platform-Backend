import type { ReactElement } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "../../components/ui";

const dateRanges = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "year", label: "This Year" },
];

const events = [
  { value: "all", label: "All Events" },
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
  { value: "5", label: "Jazz Night" },
];

const tabs = ["Overview", "By Event", "By Ticket Type", "Over Time"];

const salesByEvent = [
  { name: "Tech Conference", tickets: 856, revenue: 256800, change: 15 },
  { name: "Summer Music Festival", tickets: 1432, revenue: 98500, change: 8 },
  { name: "Jazz Night", tickets: 245, revenue: 12250, change: -3 },
  { name: "Comedy Night", tickets: 312, revenue: 9360, change: 22 },
  { name: "Art Gallery Opening", tickets: 175, revenue: 8750, change: 0 },
];

const salesByTicketType = [
  { type: "General Admission", tickets: 1856, revenue: 120640, percent: 45 },
  { type: "VIP Access", tickets: 423, revenue: 84600, percent: 25 },
  { type: "Early Bird", tickets: 312, revenue: 21840, percent: 18 },
  { type: "Student", tickets: 254, revenue: 7620, percent: 12 },
];

const salesOverTime = [
  { date: "Jun 1", sales: 45 },
  { date: "Jun 5", sales: 78 },
  { date: "Jun 10", sales: 124 },
  { date: "Jun 15", sales: 89 },
  { date: "Jun 20", sales: 156 },
  { date: "Jun 25", sales: 203 },
  { date: "Jun 28", sales: 178 },
];

export default function SalesAnalytics() {
  const [dateRange, setDateRange] = useState("30d");
  const [eventFilter, setEventFilter] = useState("all");
  const [activeTab, setActiveTab] = useState("Overview");
  const [showComparison, setShowComparison] = useState(false);

  const maxSales = Math.max(...salesOverTime.map(d => d.sales));
  const maxTickets = Math.max(...salesByEvent.map(e => e.tickets));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/analytics" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sales Analytics</h1>
            <p className="text-gray-500">Detailed ticket sales data</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        >
          {dateRanges.map(range => (
            <option key={range.value} value={range.value}>{range.label}</option>
          ))}
        </select>
        <select
          value={eventFilter}
          onChange={(e) => setEventFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        >
          {events.map(event => (
            <option key={event.value} value={event.value}>{event.label}</option>
          ))}
        </select>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === "Overview" && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-500">Total Tickets Sold</p>
            <p className="text-3xl font-bold text-gray-900">2,845</p>
            <div className="flex items-center gap-1 mt-2 text-sm">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-green-600">12%</span>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-500">Total Revenue</p>
            <p className="text-3xl font-bold text-green-600">$375,660</p>
            <div className="flex items-center gap-1 mt-2 text-sm">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-green-600">18%</span>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-500">Avg Order Value</p>
            <p className="text-3xl font-bold text-gray-900">$132</p>
            <div className="flex items-center gap-1 mt-2 text-sm">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-green-600">5%</span>
            </div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-sm text-gray-500">Conversion Rate</p>
            <p className="text-3xl font-bold text-gray-900">4.2%</p>
            <div className="flex items-center gap-1 mt-2 text-sm">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <span className="text-red-600">0.3%</span>
            </div>
          </div>
        </div>
      )}

      {/* By Event Tab */}
      {activeTab === "By Event" && (
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Sales by Event</h2>
            <div className="space-y-4">
              {salesByEvent.map((event, index) => (
                <div key={index}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-900">{event.name}</span>
                    <span className="text-sm text-gray-600">{event.tickets} tickets</span>
                  </div>
                  <div className="w-full h-3 bg-gray-200 rounded-full">
                    <div
                      className="h-3 bg-purple-500 rounded-full"
                      style={{ width: `${(event.tickets / maxTickets) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Event Sales Table</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Change</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {salesByEvent.map((event, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{event.name}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{event.tickets}</td>
                    <td className="px-6 py-4 text-right text-green-600">${event.revenue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right">
                      <span className={event.change > 0 ? "text-green-600" : event.change < 0 ? "text-red-600" : "text-gray-500"}>
                        {event.change > 0 ? "+" : ""}{event.change}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* By Ticket Type Tab */}
      {activeTab === "By Ticket Type" && (
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Ticket Type Distribution</h2>
            {/* Simple pie chart representation */}
            <div className="flex items-center justify-center mb-6">
              <div className="relative w-48 h-48">
                <svg viewBox="0 0 100 100" className="transform -rotate-90">
                  {salesByTicketType.reduce((acc, type, index) => {
                    const colors = ["#8b5cf6", "#3b82f6", "#10b981", "#f59e0b"];
                    const startPercent = acc.offset;
                    acc.elements.push(
                      <circle
                        key={index}
                        cx="50"
                        cy="50"
                        r="40"
                        fill="transparent"
                        stroke={colors[index]}
                        strokeWidth="20"
                        strokeDasharray={`${type.percent * 2.51} ${251 - type.percent * 2.51}`}
                        strokeDashoffset={-startPercent * 2.51}
                      />
                    );
                    acc.offset += type.percent;
                    return acc;
                  }, { offset: 0, elements: [] as ReactElement[] }).elements}
                </svg>
              </div>
            </div>
            <div className="space-y-2">
              {salesByTicketType.map((type, index) => {
                const colors = ["bg-purple-500", "bg-blue-500", "bg-green-500", "bg-yellow-500"];
                return (
                  <div key={index} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${colors[index]}`} />
                      <span className="text-sm text-gray-700">{type.type}</span>
                    </div>
                    <span className="text-sm font-medium text-gray-900">{type.percent}%</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Ticket Type Breakdown</h2>
            </div>
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {salesByTicketType.map((type, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{type.type}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{type.tickets}</td>
                    <td className="px-6 py-4 text-right text-green-600">${type.revenue.toLocaleString()}</td>
                    <td className="px-6 py-4 text-right text-gray-600">{type.percent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Over Time Tab */}
      {activeTab === "Over Time" && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Sales Over Time</h2>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showComparison}
                onChange={(e) => setShowComparison(e.target.checked)}
                className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
              />
              Compare to previous period
            </label>
          </div>
          <div className="h-64 flex items-end justify-between gap-3">
            {salesOverTime.map((point, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                {showComparison && (
                  <div
                    className="w-full bg-gray-300 rounded-t mb-1"
                    style={{ height: `${((point.sales * 0.85) / maxSales) * 200}px` }}
                  />
                )}
                <div
                  className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                  style={{ height: `${(point.sales / maxSales) * 200}px` }}
                />
                <span className="text-xs text-gray-500 mt-2">{point.date}</span>
              </div>
            ))}
          </div>
          {showComparison && (
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-purple-500 rounded" />
                <span className="text-sm text-gray-600">Current Period</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-300 rounded" />
                <span className="text-sm text-gray-600">Previous Period</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

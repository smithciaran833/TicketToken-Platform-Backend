import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, TrendingUp, DollarSign } from "lucide-react";
import { Button } from "../../components/ui";

const dateRanges = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "year", label: "This Year" },
];

const revenueBreakdown = [
  { source: "Ticket Sales", amount: 325000, percent: 86, color: "bg-purple-500" },
  { source: "Add-Ons", amount: 28500, percent: 8, color: "bg-blue-500" },
  { source: "Resale Royalties", amount: 12800, percent: 3, color: "bg-green-500" },
  { source: "Service Fees", amount: 9360, percent: 3, color: "bg-yellow-500" },
];

const revenueByEvent = [
  { name: "Tech Conference", revenue: 256800 },
  { name: "Summer Music Festival", revenue: 98500 },
  { name: "Jazz Night", revenue: 12250 },
  { name: "Comedy Night", revenue: 9360 },
];

const revenueOverTime = [
  { month: "Jan", value: 42000 },
  { month: "Feb", value: 58000 },
  { month: "Mar", value: 71000 },
  { month: "Apr", value: 49000 },
  { month: "May", value: 82000 },
  { month: "Jun", value: 73660 },
];

const projectedRevenue = [
  { event: "Art Gallery Opening", date: "Sep 5", projected: 8750, ticketsSold: 175 },
  { event: "Fall Concert Series", date: "Oct 12", projected: 45000, ticketsSold: 312 },
  { event: "Holiday Gala", date: "Dec 20", projected: 125000, ticketsSold: 89 },
];

export default function RevenueAnalytics() {
  const [dateRange, setDateRange] = useState("30d");

  const totalRevenue = revenueBreakdown.reduce((sum, r) => sum + r.amount, 0);
  const maxEventRevenue = Math.max(...revenueByEvent.map(e => e.revenue));
  const maxMonthRevenue = Math.max(...revenueOverTime.map(m => m.value));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/analytics" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Revenue Analytics</h1>
            <p className="text-gray-500">Track revenue across all sources</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {dateRanges.map(range => (
              <option key={range.value} value={range.value}>{range.label}</option>
            ))}
          </select>
          <Button variant="secondary">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Total Revenue Card */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-lg p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-purple-200">Total Revenue</p>
            <p className="text-4xl font-bold">${totalRevenue.toLocaleString()}</p>
            <div className="flex items-center gap-2 mt-2">
              <TrendingUp className="w-4 h-4" />
              <span>18% increase from last period</span>
            </div>
          </div>
          <div className="w-16 h-16 bg-white/20 rounded-lg flex items-center justify-center">
            <DollarSign className="w-8 h-8" />
          </div>
        </div>
      </div>

      {/* Revenue Breakdown */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Breakdown</h2>
          <div className="space-y-4">
            {revenueBreakdown.map((source, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-3 h-3 rounded-full ${source.color}`} />
                    <span className="text-sm font-medium text-gray-900">{source.source}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">${source.amount.toLocaleString()}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full">
                  <div 
                    className={`h-2 rounded-full ${source.color}`}
                    style={{ width: `${source.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue by Event</h2>
          <div className="space-y-4">
            {revenueByEvent.map((event, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{event.name}</span>
                  <span className="text-sm font-medium text-green-600">${event.revenue.toLocaleString()}</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full">
                  <div 
                    className="h-2 bg-green-500 rounded-full"
                    style={{ width: `${(event.revenue / maxEventRevenue) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue Over Time */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Over Time</h2>
        <div className="h-48 flex items-end justify-between gap-4">
          {revenueOverTime.map((month, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="text-sm font-medium text-gray-900 mb-2">${(month.value / 1000).toFixed(0)}k</div>
              <div 
                className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                style={{ height: `${(month.value / maxMonthRevenue) * 140}px` }}
              />
              <span className="text-xs text-gray-500 mt-2">{month.month}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Projected Revenue */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Projected Revenue (Upcoming Events)</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets Sold</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Projected Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {projectedRevenue.map((event, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">{event.event}</td>
                <td className="px-6 py-4 text-gray-600">{event.date}</td>
                <td className="px-6 py-4 text-right text-gray-600">{event.ticketsSold}</td>
                <td className="px-6 py-4 text-right font-medium text-green-600">${event.projected.toLocaleString()}</td>
              </tr>
            ))}
            <tr className="bg-gray-50 font-semibold">
              <td className="px-6 py-4" colSpan={3}>Total Projected</td>
              <td className="px-6 py-4 text-right text-green-600">
                ${projectedRevenue.reduce((sum, e) => sum + e.projected, 0).toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

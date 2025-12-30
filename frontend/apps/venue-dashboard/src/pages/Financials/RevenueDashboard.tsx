import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, DollarSign, TrendingUp } from "lucide-react";
import { Button } from "../../components/ui";

const dateRanges = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "year", label: "This Year" },
];

const revenueBreakdown = [
  { source: "Ticket Sales", amount: 325000, percent: 87, color: "bg-purple-500" },
  { source: "Add-Ons", amount: 28500, percent: 8, color: "bg-blue-500" },
  { source: "Resale Royalties", amount: 18660, percent: 5, color: "bg-green-500" },
];

const revenueByEvent = [
  { name: "Tech Conference", revenue: 256800, tickets: 856, avgPrice: 300 },
  { name: "Summer Music Festival", revenue: 98500, tickets: 1432, avgPrice: 69 },
  { name: "Jazz Night", revenue: 12250, tickets: 245, avgPrice: 50 },
  { name: "Comedy Night", revenue: 9360, tickets: 312, avgPrice: 30 },
];

const revenueByTicketType = [
  { type: "General Admission", revenue: 120640, tickets: 1856, percent: 32 },
  { type: "VIP Access", revenue: 84600, tickets: 423, percent: 23 },
  { type: "Early Bird", revenue: 65400, tickets: 1090, percent: 17 },
  { type: "Premium", revenue: 52000, tickets: 260, percent: 14 },
  { type: "Student", revenue: 28500, tickets: 950, percent: 8 },
];

const trendData = [
  { month: "Jan", value: 42000 },
  { month: "Feb", value: 58000 },
  { month: "Mar", value: 71000 },
  { month: "Apr", value: 49000 },
  { month: "May", value: 82000 },
  { month: "Jun", value: 73660 },
];

export default function RevenueDashboard() {
  const [dateRange, setDateRange] = useState("30d");

  const totalRevenue = revenueBreakdown.reduce((sum, r) => sum + r.amount, 0);
  const maxTrend = Math.max(...trendData.map(t => t.value));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/financials" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Revenue</h1>
            <p className="text-gray-500">Detailed revenue breakdown</p>
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
      <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-lg p-6 mb-6 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-green-200">Total Revenue</p>
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
                  <div className={`h-2 rounded-full ${source.color}`} style={{ width: `${source.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h2>
          <div className="h-48 flex items-end justify-between gap-3">
            {trendData.map((month, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div className="text-xs font-medium text-gray-600 mb-1">${(month.value / 1000).toFixed(0)}k</div>
                <div 
                  className="w-full bg-green-500 rounded-t transition-all hover:bg-green-600"
                  style={{ height: `${(month.value / maxTrend) * 140}px` }}
                />
                <span className="text-xs text-gray-500 mt-2">{month.month}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Revenue by Event */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Revenue by Event</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets Sold</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Price</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {revenueByEvent.map((event, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">{event.name}</td>
                <td className="px-6 py-4 text-right text-gray-600">{event.tickets.toLocaleString()}</td>
                <td className="px-6 py-4 text-right text-gray-600">${event.avgPrice}</td>
                <td className="px-6 py-4 text-right font-medium text-green-600">${event.revenue.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Revenue by Ticket Type */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Revenue by Ticket Type</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket Type</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets Sold</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Share</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {revenueByTicketType.map((type, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4 font-medium text-gray-900">{type.type}</td>
                <td className="px-6 py-4 text-right text-gray-600">{type.tickets.toLocaleString()}</td>
                <td className="px-6 py-4 text-right font-medium text-green-600">${type.revenue.toLocaleString()}</td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <div className="w-16 h-2 bg-gray-200 rounded-full">
                      <div className="h-2 bg-purple-500 rounded-full" style={{ width: `${type.percent * 2.5}%` }} />
                    </div>
                    <span className="text-gray-600 w-8">{type.percent}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

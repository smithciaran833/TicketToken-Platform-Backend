import type { ReactElement } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Users } from "lucide-react";
import { Button } from "../../components/ui";

const dateRanges = [
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
];

const ageGroups = [
  { range: "18-24", percent: 22, count: 625 },
  { range: "25-34", percent: 38, count: 1080 },
  { range: "35-44", percent: 24, count: 682 },
  { range: "45-54", percent: 11, count: 312 },
  { range: "55+", percent: 5, count: 142 },
];

const genderData = [
  { label: "Male", percent: 48, color: "bg-blue-500" },
  { label: "Female", percent: 46, color: "bg-pink-500" },
  { label: "Other/Not Specified", percent: 6, color: "bg-gray-400" },
];

const topLocations = [
  { city: "New York", state: "NY", count: 423, percent: 15 },
  { city: "Los Angeles", state: "CA", count: 312, percent: 11 },
  { city: "Chicago", state: "IL", count: 245, percent: 9 },
  { city: "Houston", state: "TX", count: 189, percent: 7 },
  { city: "Phoenix", state: "AZ", count: 156, percent: 5 },
];

const customerSegments = [
  { name: "First-time Buyers", count: 1245, percent: 44, trend: "up" },
  { name: "Repeat Customers", count: 892, percent: 31, trend: "up" },
  { name: "VIP Buyers", count: 423, percent: 15, trend: "stable" },
  { name: "Group Buyers", count: 281, percent: 10, trend: "down" },
];

export default function Demographics() {
  const [dateRange, setDateRange] = useState("90d");

  const maxAge = Math.max(...ageGroups.map(a => a.percent));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/analytics" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Audience Demographics</h1>
            <p className="text-gray-500">Understand your audience</p>
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

      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total Customers</p>
          <p className="text-3xl font-bold text-gray-900">2,841</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Repeat Customer Rate</p>
          <p className="text-3xl font-bold text-purple-600">31%</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">New Customers (This Period)</p>
          <p className="text-3xl font-bold text-green-600">1,245</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Age Distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Age Distribution</h2>
          <div className="space-y-3">
            {ageGroups.map((group, index) => (
              <div key={index} className="flex items-center gap-4">
                <span className="w-12 text-sm font-medium text-gray-700">{group.range}</span>
                <div className="flex-1">
                  <div className="w-full h-6 bg-gray-200 rounded-full">
                    <div
                      className="h-6 bg-purple-500 rounded-full flex items-center justify-end pr-2"
                      style={{ width: `${(group.percent / maxAge) * 100}%` }}
                    >
                      <span className="text-xs font-medium text-white">{group.percent}%</span>
                    </div>
                  </div>
                </div>
                <span className="w-16 text-sm text-gray-500 text-right">{group.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Gender Distribution */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Gender Distribution</h2>
          <div className="flex items-center justify-center mb-6">
            <div className="relative w-48 h-48">
              <svg viewBox="0 0 100 100" className="transform -rotate-90">
                {genderData.reduce((acc, item, index) => {
                  const colors = ["#3b82f6", "#ec4899", "#9ca3af"];
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
                      strokeDasharray={`${item.percent * 2.51} ${251 - item.percent * 2.51}`}
                      strokeDashoffset={-startPercent * 2.51}
                    />
                  );
                  acc.offset += item.percent;
                  return acc;
                }, { offset: 0, elements: [] as ReactElement[] }).elements}
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            {genderData.map((item, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${item.color}`} />
                  <span className="text-sm text-gray-700">{item.label}</span>
                </div>
                <span className="text-sm font-medium text-gray-900">{item.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Top Locations */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Locations</h2>
          <div className="space-y-3">
            {topLocations.map((loc, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{loc.city}, {loc.state}</p>
                  <p className="text-sm text-gray-500">{loc.count} customers</p>
                </div>
                <span className="text-lg font-bold text-purple-600">{loc.percent}%</span>
              </div>
            ))}
          </div>
          <Link to="/venue/analytics/geographic" className="block text-center text-sm text-purple-600 hover:text-purple-700 mt-4">
            View Full Map →
          </Link>
        </div>

        {/* Customer Segments */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Segments</h2>
          <div className="space-y-3">
            {customerSegments.map((segment, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Users className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{segment.name}</p>
                    <p className="text-sm text-gray-500">{segment.count} customers</p>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-gray-900">{segment.percent}%</span>
                  <p className={`text-xs ${
                    segment.trend === "up" ? "text-green-600" :
                    segment.trend === "down" ? "text-red-600" : "text-gray-500"
                  }`}>
                    {segment.trend === "up" ? "↑ Growing" : segment.trend === "down" ? "↓ Declining" : "→ Stable"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Privacy Note */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          <strong>Note:</strong> Demographic data is collected from ticket purchaser information and may not represent all attendees.
          Data is anonymized and aggregated to protect customer privacy.
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { ArrowLeft, Download, TrendingUp, TrendingDown, DollarSign, Percent, Users, Tag } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, useToast, ToastContainer } from "../../components/ui";

const dateRanges = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "year", label: "This Year" },
  { value: "all", label: "All Time" },
];

const topPromoCodes = [
  { code: "SUMMER20", uses: 145, revenue: 18850, discount: 4712, conversionRate: 68 },
  { code: "EARLYBIRD", uses: 300, revenue: 15000, discount: 2925, conversionRate: 72 },
  { code: "VIPFRIEND", uses: 23, revenue: 3450, discount: 1150, conversionRate: 45 },
  { code: "FLASH10", uses: 89, revenue: 8900, discount: 890, conversionRate: 55 },
  { code: "FREETICKET", uses: 5, revenue: 175, discount: 175, conversionRate: 100 },
];

const usageOverTime = [
  { date: "Jun 1", uses: 12 },
  { date: "Jun 5", uses: 28 },
  { date: "Jun 10", uses: 45 },
  { date: "Jun 15", uses: 32 },
  { date: "Jun 20", uses: 67 },
  { date: "Jun 25", uses: 89 },
  { date: "Jun 28", uses: 54 },
];

export default function PromoAnalytics() {
  const toast = useToast();
  const [dateRange, setDateRange] = useState("30d");

  const handleExport = () => {
    toast.success("Exporting analytics data...");
  };

  // Summary stats
  const totalDiscounts = 9852;
  const ordersWithPromos = 562;
  const promoConversionRate = 64;
  const totalPromoRevenue = 46375;

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/tickets/promos" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Promo Code Analytics</h1>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          >
            {dateRanges.map(range => (
              <option key={range.value} value={range.value}>{range.label}</option>
            ))}
          </select>
          <Button variant="secondary" onClick={handleExport}>
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
              <p className="text-sm text-gray-500">Total Discounts Given</p>
              <p className="text-3xl font-bold text-red-600">${totalDiscounts.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-red-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            <TrendingUp className="w-4 h-4 text-red-500" />
            <span className="text-red-600">12%</span>
            <span className="text-gray-500">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Orders with Promos</p>
              <p className="text-3xl font-bold text-gray-900">{ordersWithPromos}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Tag className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-green-600">8%</span>
            <span className="text-gray-500">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Promo Conversion Rate</p>
              <p className="text-3xl font-bold text-gray-900">{promoConversionRate}%</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <Percent className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            <TrendingDown className="w-4 h-4 text-red-500" />
            <span className="text-red-600">3%</span>
            <span className="text-gray-500">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Revenue (with Promos)</p>
              <p className="text-3xl font-bold text-green-600">${totalPromoRevenue.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            <TrendingUp className="w-4 h-4 text-green-500" />
            <span className="text-green-600">15%</span>
            <span className="text-gray-500">vs last period</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Usage Over Time Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Usage Over Time</h2>
          <div className="h-64 flex items-end justify-between gap-2">
            {usageOverTime.map((day, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                  style={{ height: `${(day.uses / 100) * 200}px` }}
                />
                <span className="text-xs text-gray-500 mt-2">{day.date}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Codes Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Top Promo Codes by Usage</h2>
          <div className="space-y-4">
            {topPromoCodes.slice(0, 5).map((promo, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-mono text-sm font-medium text-purple-600">{promo.code}</span>
                  <span className="text-sm text-gray-600">{promo.uses} uses</span>
                </div>
                <div className="w-full h-2 bg-gray-200 rounded-full">
                  <div 
                    className="h-2 bg-purple-500 rounded-full"
                    style={{ width: `${(promo.uses / 300) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Comparison Table */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Promo Code Performance</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Code</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Uses</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Revenue Generated</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Discount Given</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Conversion Rate</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">ROI</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {topPromoCodes.map((promo, index) => {
              const roi = ((promo.revenue - promo.discount) / promo.discount * 100).toFixed(0);
              return (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link 
                      to={`/venue/tickets/promos/${index + 1}`}
                      className="font-mono text-sm font-medium text-purple-600 hover:text-purple-700"
                    >
                      {promo.code}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-900">{promo.uses}</td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-green-600">
                    ${promo.revenue.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-sm font-medium text-red-600">
                    -${promo.discount.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 text-right text-sm text-gray-900">{promo.conversionRate}%</td>
                  <td className="px-6 py-4 text-right">
                    <span className={`text-sm font-medium ${parseInt(roi) > 0 ? "text-green-600" : "text-red-600"}`}>
                      {parseInt(roi) > 0 ? "+" : ""}{roi}%
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

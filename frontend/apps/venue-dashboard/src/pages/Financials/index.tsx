import { useState } from "react";
import { Link } from "react-router-dom";
import { DollarSign, TrendingUp, CreditCard, ArrowUpRight, ArrowDownRight, ChevronRight, Calendar, AlertTriangle } from "lucide-react";

const dateRanges = [
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
  { value: "90d", label: "Last 90 Days" },
  { value: "year", label: "This Year" },
];

const recentTransactions = [
  { id: "TXN-001", type: "sale", description: "2x VIP Access - Summer Music Festival", customer: "John Smith", amount: 300, date: "Today, 2:34 PM" },
  { id: "TXN-002", type: "sale", description: "1x General Admission - Jazz Night", customer: "Sarah Johnson", amount: 50, date: "Today, 1:15 PM" },
  { id: "TXN-003", type: "refund", description: "Refund - Tech Conference", customer: "Mike Chen", amount: -150, date: "Today, 11:30 AM" },
  { id: "TXN-004", type: "sale", description: "4x General Admission - Summer Music Festival", customer: "Emily Davis", amount: 260, date: "Yesterday" },
  { id: "TXN-005", type: "fee", description: "Platform fee - June", customer: "-", amount: -1250, date: "Jun 30" },
];

const recentPayouts = [
  { id: "PAY-001", amount: 12500, status: "completed", date: "Jun 28", bank: "****4521" },
  { id: "PAY-002", amount: 8750, status: "pending", date: "Jul 5", bank: "****4521" },
  { id: "PAY-003", amount: 15200, status: "completed", date: "Jun 21", bank: "****4521" },
];

const revenueData = [
  { month: "Jan", value: 42000 },
  { month: "Feb", value: 58000 },
  { month: "Mar", value: 71000 },
  { month: "Apr", value: 49000 },
  { month: "May", value: 82000 },
  { month: "Jun", value: 73660 },
];

function getTypeStyles(type: string) {
  switch (type) {
    case "sale": return { bg: "bg-green-100", text: "text-green-700", label: "Sale" };
    case "refund": return { bg: "bg-red-100", text: "text-red-700", label: "Refund" };
    case "fee": return { bg: "bg-gray-100", text: "text-gray-700", label: "Fee" };
    case "payout": return { bg: "bg-blue-100", text: "text-blue-700", label: "Payout" };
    default: return { bg: "bg-gray-100", text: "text-gray-700", label: type };
  }
}

function getPayoutStatusStyles(status: string) {
  switch (status) {
    case "completed": return "bg-green-100 text-green-700";
    case "pending": return "bg-yellow-100 text-yellow-700";
    case "failed": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function FinancialsOverview() {
  const [dateRange, setDateRange] = useState("30d");
  const maxRevenue = Math.max(...revenueData.map(d => d.value));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Financials</h1>
          <p className="text-gray-500">Track revenue, payouts, and transactions</p>
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

      {/* Balance Card */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 rounded-lg p-6 mb-6 text-white">
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-purple-200">Available Balance</p>
            <p className="text-4xl font-bold">$24,580</p>
            <p className="text-purple-200 text-sm mt-1">Ready to withdraw</p>
          </div>
          <div>
            <p className="text-purple-200">Pending Balance</p>
            <p className="text-4xl font-bold">$8,750</p>
            <p className="text-purple-200 text-sm mt-1">Processing</p>
          </div>
          <div>
            <p className="text-purple-200">Next Payout</p>
            <p className="text-4xl font-bold">Jul 5</p>
            <p className="text-purple-200 text-sm mt-1">$8,750 to ****4521</p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Revenue</p>
              <p className="text-2xl font-bold text-gray-900">$375,660</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            <ArrowUpRight className="w-4 h-4 text-green-500" />
            <span className="text-green-600">18%</span>
            <span className="text-gray-500">vs last period</span>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Platform Fees</p>
              <p className="text-2xl font-bold text-gray-900">$18,783</p>
            </div>
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">5% of revenue</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Refunds Issued</p>
              <p className="text-2xl font-bold text-red-600">$4,250</p>
            </div>
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <ArrowDownRight className="w-5 h-5 text-red-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">12 refunds</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Net Revenue</p>
              <p className="text-2xl font-bold text-green-600">$352,627</p>
            </div>
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
          </div>
          <div className="flex items-center gap-1 mt-2 text-sm">
            <ArrowUpRight className="w-4 h-4 text-green-500" />
            <span className="text-green-600">15%</span>
            <span className="text-gray-500">vs last period</span>
          </div>
        </div>
      </div>

      {/* Revenue Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Revenue Over Time</h2>
          <Link to="/venue/financials/revenue" className="text-sm text-purple-600 hover:text-purple-700">
            View Details
          </Link>
        </div>
        <div className="h-48 flex items-end justify-between gap-4">
          {revenueData.map((month, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="text-sm font-medium text-gray-600 mb-2">${(month.value / 1000).toFixed(0)}k</div>
              <div 
                className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                style={{ height: `${(month.value / maxRevenue) * 130}px` }}
              />
              <span className="text-xs text-gray-500 mt-2">{month.month}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Recent Transactions */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Transactions</h2>
            <Link to="/venue/financials/transactions" className="text-sm text-purple-600 hover:text-purple-700">
              View All
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {recentTransactions.slice(0, 5).map((txn) => {
              const styles = getTypeStyles(txn.type);
              return (
                <Link 
                  key={txn.id} 
                  to={`/venue/financials/transactions/${txn.id}`}
                  className="px-6 py-3 flex items-center justify-between hover:bg-gray-50"
                >
                  <div className="flex items-center gap-3">
                    <span className={`px-2 py-0.5 text-xs font-medium rounded ${styles.bg} ${styles.text}`}>
                      {styles.label}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900 truncate max-w-[200px]">{txn.description}</p>
                      <p className="text-xs text-gray-500">{txn.date}</p>
                    </div>
                  </div>
                  <span className={`font-medium ${txn.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {txn.amount >= 0 ? "+" : ""}${Math.abs(txn.amount).toLocaleString()}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Recent Payouts */}
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Recent Payouts</h2>
            <Link to="/venue/financials/payouts" className="text-sm text-purple-600 hover:text-purple-700">
              View All
            </Link>
          </div>
          <div className="divide-y divide-gray-200">
            {recentPayouts.map((payout) => (
              <Link 
                key={payout.id} 
                to={`/venue/financials/payouts/${payout.id}`}
                className="px-6 py-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-gray-900">${payout.amount.toLocaleString()}</p>
                  <p className="text-sm text-gray-500">To {payout.bank} • {payout.date}</p>
                </div>
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPayoutStatusStyles(payout.status)}`}>
                  {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-4 gap-4">
        <Link to="/venue/financials/revenue" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>
              <span className="font-medium text-gray-900">Revenue</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        <Link to="/venue/financials/refunds" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                <ArrowDownRight className="w-5 h-5 text-red-600" />
              </div>
              <span className="font-medium text-gray-900">Refunds</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        <Link to="/venue/financials/chargebacks" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-yellow-600" />
              </div>
              <span className="font-medium text-gray-900">Chargebacks</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        <Link to="/venue/financials/tax" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-5 h-5 text-blue-600" />
              </div>
              <span className="font-medium text-gray-900">Tax Documents</span>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>
      </div>
    </div>
  );
}

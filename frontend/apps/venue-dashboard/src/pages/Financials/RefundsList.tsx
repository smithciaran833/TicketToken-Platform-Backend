import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Download } from "lucide-react";
import { Button } from "../../components/ui";

const refunds = [
  { id: "REF-001", orderId: "ORD-1234", customer: "Mike Chen", email: "mike@email.com", event: "Tech Conference", amount: 150, reason: "Unable to attend", status: "completed", date: "Jun 29, 2025" },
  { id: "REF-002", orderId: "ORD-1456", customer: "Tom Harris", email: "tom@email.com", event: "Summer Music Festival", amount: 65, reason: "Duplicate purchase", status: "completed", date: "Jun 27, 2025" },
  { id: "REF-003", orderId: "ORD-1589", customer: "Lisa Brown", email: "lisa@email.com", event: "Jazz Night", amount: 100, reason: "Event cancelled", status: "pending", date: "Jun 26, 2025" },
  { id: "REF-004", orderId: "ORD-1602", customer: "Alex Wilson", email: "alex@email.com", event: "Comedy Night", amount: 60, reason: "Customer request", status: "completed", date: "Jun 25, 2025" },
];

const tabs = ["All", "Pending", "Completed"];

const reasonFilters = [
  { value: "all", label: "All Reasons" },
  { value: "unable-to-attend", label: "Unable to attend" },
  { value: "event-cancelled", label: "Event cancelled" },
  { value: "duplicate-purchase", label: "Duplicate purchase" },
  { value: "customer-request", label: "Customer request" },
];

function getStatusStyles(status: string) {
  switch (status) {
    case "completed": return "bg-green-100 text-green-700";
    case "pending": return "bg-yellow-100 text-yellow-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function RefundsList() {
  const [activeTab, setActiveTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");

  const totalRefunds = refunds.reduce((sum, r) => sum + r.amount, 0);

  const filteredRefunds = refunds.filter(refund => {
    if (activeTab !== "All" && refund.status !== activeTab.toLowerCase()) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!refund.customer.toLowerCase().includes(query) && 
          !refund.orderId.toLowerCase().includes(query)) return false;
    }
    return true;
  });

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/financials" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Refunds</h1>
            <p className="text-gray-500">Manage refund requests</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Summary */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-red-600">Total Refunds Issued</p>
            <p className="text-2xl font-bold text-red-700">${totalRefunds.toLocaleString()}</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-red-600">{refunds.length} refunds</p>
            <p className="text-sm text-red-600">{refunds.filter(r => r.status === "pending").length} pending</p>
          </div>
        </div>
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

      {/* Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div className="relative flex-1 max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by customer or order ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          />
        </div>
        <select
          value={reasonFilter}
          onChange={(e) => setReasonFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        >
          {reasonFilters.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {/* Refunds Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredRefunds.map((refund) => (
              <tr key={refund.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-600">{refund.date}</td>
                <td className="px-6 py-4">
                  <Link 
                    to={`/venue/financials/refunds/${refund.id}`}
                    className="font-medium text-purple-600 hover:text-purple-700"
                  >
                    {refund.orderId}
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm font-medium text-gray-900">{refund.customer}</p>
                  <p className="text-xs text-gray-500">{refund.email}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{refund.event}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{refund.reason}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusStyles(refund.status)}`}>
                    {refund.status.charAt(0).toUpperCase() + refund.status.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 text-right font-medium text-red-600">
                  -${refund.amount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

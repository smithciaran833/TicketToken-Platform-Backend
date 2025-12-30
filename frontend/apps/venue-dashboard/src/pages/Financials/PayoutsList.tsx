import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Settings } from "lucide-react";
import { Button } from "../../components/ui";

const payouts = [
  { id: "PAY-001", amount: 12500, status: "completed", date: "Jun 28, 2025", completedDate: "Jun 30, 2025", bank: "****4521", period: "Jun 21 - Jun 27" },
  { id: "PAY-002", amount: 8750, status: "pending", date: "Jul 5, 2025", completedDate: null, bank: "****4521", period: "Jun 28 - Jul 4" },
  { id: "PAY-003", amount: 15200, status: "completed", date: "Jun 21, 2025", completedDate: "Jun 23, 2025", bank: "****4521", period: "Jun 14 - Jun 20" },
  { id: "PAY-004", amount: 9800, status: "completed", date: "Jun 14, 2025", completedDate: "Jun 16, 2025", bank: "****4521", period: "Jun 7 - Jun 13" },
  { id: "PAY-005", amount: 11250, status: "failed", date: "Jun 7, 2025", completedDate: null, bank: "****4521", period: "May 31 - Jun 6", failureReason: "Insufficient funds in connected account" },
];

const tabs = ["All", "Pending", "Completed", "Failed"];

function getStatusStyles(status: string) {
  switch (status) {
    case "completed": return "bg-green-100 text-green-700";
    case "pending": return "bg-yellow-100 text-yellow-700";
    case "failed": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function PayoutsList() {
  const [activeTab, setActiveTab] = useState("All");

  const filteredPayouts = payouts.filter(payout => {
    if (activeTab === "All") return true;
    return payout.status === activeTab.toLowerCase();
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
            <h1 className="text-3xl font-bold text-gray-900">Payouts</h1>
            <p className="text-gray-500">Track your payout history</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/venue/financials/settings">
            <Button variant="secondary">
              <Settings className="w-4 h-4" />
              Payout Settings
            </Button>
          </Link>
          <Button variant="secondary">
            <Download className="w-4 h-4" />
            Export
          </Button>
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
            {tab === "Failed" && payouts.filter(p => p.status === "failed").length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-red-100 text-red-700 rounded-full">
                {payouts.filter(p => p.status === "failed").length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Payouts Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Payout ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Period</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bank Account</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredPayouts.map((payout) => (
              <tr key={payout.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <Link 
                    to={`/venue/financials/payouts/${payout.id}`}
                    className="font-medium text-purple-600 hover:text-purple-700"
                  >
                    {payout.id}
                  </Link>
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm text-gray-900">{payout.date}</p>
                  {payout.completedDate && (
                    <p className="text-xs text-gray-500">Completed: {payout.completedDate}</p>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{payout.period}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{payout.bank}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusStyles(payout.status)}`}>
                    {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
                  </span>
                  {payout.failureReason && (
                    <p className="text-xs text-red-600 mt-1">{payout.failureReason}</p>
                  )}
                </td>
                <td className="px-6 py-4 text-right font-medium text-gray-900">
                  ${payout.amount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

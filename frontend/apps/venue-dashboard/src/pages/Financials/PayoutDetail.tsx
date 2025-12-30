import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "../../components/ui";

const mockPayouts: Record<string, any> = {
  "PAY-001": {
    id: "PAY-001",
    amount: 12500,
    status: "completed",
    dateInitiated: "Jun 28, 2025",
    dateCompleted: "Jun 30, 2025",
    bank: { name: "Chase Bank", type: "Checking", last4: "4521" },
    period: "Jun 21 - Jun 27, 2025",
    transactions: [
      { id: "TXN-101", description: "Summer Music Festival tickets", amount: 8500 },
      { id: "TXN-102", description: "Jazz Night tickets", amount: 2400 },
      { id: "TXN-103", description: "Add-on sales", amount: 1850 },
      { id: "TXN-104", description: "Refund - TXN-098", amount: -250 },
    ],
    grossAmount: 12750,
    fees: 250,
    netPayout: 12500,
  },
  "PAY-002": {
    id: "PAY-002",
    amount: 8750,
    status: "pending",
    dateInitiated: "Jul 5, 2025",
    dateCompleted: null,
    expectedDate: "Jul 7, 2025",
    bank: { name: "Chase Bank", type: "Checking", last4: "4521" },
    period: "Jun 28 - Jul 4, 2025",
    transactions: [
      { id: "TXN-201", description: "Tech Conference tickets", amount: 6500 },
      { id: "TXN-202", description: "Summer Music Festival tickets", amount: 2450 },
    ],
    grossAmount: 8950,
    fees: 200,
    netPayout: 8750,
  },
};

function getStatusStyles(status: string) {
  switch (status) {
    case "completed": return "bg-green-100 text-green-700";
    case "pending": return "bg-yellow-100 text-yellow-700";
    case "failed": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function PayoutDetail() {
  const { id } = useParams();
  const payout = mockPayouts[id || "PAY-001"] || mockPayouts["PAY-001"];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/financials/payouts" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{payout.id}</h1>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${getStatusStyles(payout.status)}`}>
                {payout.status.charAt(0).toUpperCase() + payout.status.slice(1)}
              </span>
            </div>
            <p className="text-gray-500">Period: {payout.period}</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Download Statement
        </Button>
      </div>

      {/* Payout Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payout Summary</h2>
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Amount</p>
              <p className="text-3xl font-bold text-green-600">${payout.amount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Date Initiated</p>
              <p className="font-medium text-gray-900">{payout.dateInitiated}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">{payout.status === "completed" ? "Date Completed" : "Expected Date"}</p>
              <p className="font-medium text-gray-900">{payout.dateCompleted || payout.expectedDate}</p>
            </div>
          </div>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Bank Account</p>
              <p className="font-medium text-gray-900">{payout.bank.name}</p>
              <p className="text-sm text-gray-500">{payout.bank.type} •••• {payout.bank.last4}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Period Covered</p>
              <p className="font-medium text-gray-900">{payout.period}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Transactions Included */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Transactions Included</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction ID</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {payout.transactions.map((txn: any) => (
              <tr key={txn.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <Link 
                    to={`/venue/financials/transactions/${txn.id}`}
                    className="font-medium text-purple-600 hover:text-purple-700"
                  >
                    {txn.id}
                  </Link>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{txn.description}</td>
                <td className={`px-6 py-4 text-right font-medium ${txn.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {txn.amount >= 0 ? "+" : ""}${txn.amount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Fees & Net Payout */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payout Breakdown</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Gross Amount</span>
            <span className="text-gray-900">${payout.grossAmount.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Platform Fees</span>
            <span className="text-red-600">-${payout.fees.toLocaleString()}</span>
          </div>
          <div className="border-t pt-2 flex items-center justify-between">
            <span className="font-semibold text-gray-900">Net Payout</span>
            <span className="text-xl font-bold text-green-600">${payout.netPayout.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

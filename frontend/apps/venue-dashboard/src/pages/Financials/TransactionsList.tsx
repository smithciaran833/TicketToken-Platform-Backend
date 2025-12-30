import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Search, Download } from "lucide-react";
import { Button } from "../../components/ui";

const transactions = [
  { id: "TXN-001", type: "sale", description: "2x VIP Access", customer: "John Smith", email: "john@email.com", event: "Summer Music Festival", amount: 300, date: "Jun 29, 2025 2:34 PM", status: "completed" },
  { id: "TXN-002", type: "sale", description: "1x General Admission", customer: "Sarah Johnson", email: "sarah@email.com", event: "Jazz Night", amount: 50, date: "Jun 29, 2025 1:15 PM", status: "completed" },
  { id: "TXN-003", type: "refund", description: "Refund - 1x Premium", customer: "Mike Chen", email: "mike@email.com", event: "Tech Conference", amount: -150, date: "Jun 29, 2025 11:30 AM", status: "completed" },
  { id: "TXN-004", type: "sale", description: "4x General Admission", customer: "Emily Davis", email: "emily@email.com", event: "Summer Music Festival", amount: 260, date: "Jun 28, 2025 4:22 PM", status: "completed" },
  { id: "TXN-005", type: "sale", description: "1x VIP + Parking", customer: "Alex Wilson", email: "alex@email.com", event: "Tech Conference", amount: 350, date: "Jun 28, 2025 2:10 PM", status: "completed" },
  { id: "TXN-006", type: "fee", description: "Platform fee", customer: "-", email: "-", event: "-", amount: -1250, date: "Jun 30, 2025", status: "processed" },
  { id: "TXN-007", type: "sale", description: "2x Early Bird", customer: "Lisa Brown", email: "lisa@email.com", event: "Jazz Night", amount: 80, date: "Jun 27, 2025 9:45 AM", status: "completed" },
  { id: "TXN-008", type: "refund", description: "Partial refund", customer: "Tom Harris", email: "tom@email.com", event: "Summer Music Festival", amount: -65, date: "Jun 27, 2025 3:20 PM", status: "completed" },
];

const typeFilters = [
  { value: "all", label: "All Types" },
  { value: "sale", label: "Sales" },
  { value: "refund", label: "Refunds" },
  { value: "fee", label: "Fees" },
  { value: "payout", label: "Payouts" },
];

const eventFilters = [
  { value: "all", label: "All Events" },
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
  { value: "5", label: "Jazz Night" },
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

export default function TransactionsList() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");

  const filteredTransactions = transactions.filter(txn => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      if (!txn.customer.toLowerCase().includes(query) && 
          !txn.email.toLowerCase().includes(query) &&
          !txn.id.toLowerCase().includes(query)) {
        return false;
      }
    }
    if (typeFilter !== "all" && txn.type !== typeFilter) return false;
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
            <h1 className="text-3xl font-bold text-gray-900">Transactions</h1>
            <p className="text-gray-500">View all financial transactions</p>
          </div>
        </div>
        <Button variant="secondary">
          <Download className="w-4 h-4" />
          Export
        </Button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by customer, email, or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {typeFilters.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {eventFilters.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Event</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredTransactions.map((txn) => {
              const styles = getTypeStyles(txn.type);
              return (
                <tr key={txn.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link to={`/venue/financials/transactions/${txn.id}`} className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                      {txn.id}
                    </Link>
                    <p className="text-xs text-gray-500">{txn.date}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded ${styles.bg} ${styles.text}`}>
                      {styles.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">{txn.description}</td>
                  <td className="px-6 py-4">
                    {txn.customer !== "-" ? (
                      <div>
                        <p className="text-sm font-medium text-gray-900">{txn.customer}</p>
                        <p className="text-xs text-gray-500">{txn.email}</p>
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{txn.event}</td>
                  <td className={`px-6 py-4 text-right font-medium ${txn.amount >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {txn.amount >= 0 ? "+" : ""}${Math.abs(txn.amount).toLocaleString()}
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

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, CheckCircle, XCircle, Clock } from "lucide-react";
import { Button } from "../../components/ui";

const chargebacks = [
  { id: "CHB-001", orderId: "ORD-2001", customer: "Unknown", amount: 150, reason: "Fraudulent", status: "open", deadline: "Jul 15, 2025", date: "Jun 25, 2025" },
  { id: "CHB-002", orderId: "ORD-1856", customer: "Jane Doe", amount: 300, reason: "Product not received", status: "won", deadline: "-", date: "Jun 10, 2025" },
  { id: "CHB-003", orderId: "ORD-1702", customer: "Bob Smith", amount: 75, reason: "Not as described", status: "lost", deadline: "-", date: "May 28, 2025" },
];

const statusFilters = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

function getStatusStyles(status: string) {
  switch (status) {
    case "open": return { bg: "bg-yellow-100", text: "text-yellow-700", icon: Clock };
    case "won": return { bg: "bg-green-100", text: "text-green-700", icon: CheckCircle };
    case "lost": return { bg: "bg-red-100", text: "text-red-700", icon: XCircle };
    default: return { bg: "bg-gray-100", text: "text-gray-700", icon: Clock };
  }
}

export default function Chargebacks() {
  const [statusFilter, setStatusFilter] = useState("all");

  const openCount = chargebacks.filter(c => c.status === "open").length;
  const wonCount = chargebacks.filter(c => c.status === "won").length;
  const lostCount = chargebacks.filter(c => c.status === "lost").length;
  const atRiskAmount = chargebacks.filter(c => c.status === "open").reduce((sum, c) => sum + c.amount, 0);

  const filteredChargebacks = chargebacks.filter(c => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    return true;
  });

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/financials" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Chargebacks</h1>
          <p className="text-gray-500">Manage and respond to chargebacks</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Open</p>
              <p className="text-2xl font-bold text-yellow-600">{openCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Won</p>
              <p className="text-2xl font-bold text-green-600">{wonCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <XCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Lost</p>
              <p className="text-2xl font-bold text-red-600">{lostCount}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">At Risk</p>
              <p className="text-2xl font-bold text-orange-600">${atRiskAmount}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        >
          {statusFilters.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
        </select>
      </div>

      {filteredChargebacks.length === 0 ? (
        <div className="bg-green-50 border border-green-200 rounded-lg p-12 text-center">
          <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-green-800 mb-2">No Chargebacks</h3>
          <p className="text-green-600">Great news! You have no chargebacks to manage.</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Deadline</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredChargebacks.map((chargeback) => {
                const styles = getStatusStyles(chargeback.status);
                const StatusIcon = styles.icon;
                return (
                  <tr key={chargeback.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-600">{chargeback.date}</td>
                    <td className="px-6 py-4 font-medium text-gray-900">{chargeback.orderId}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{chargeback.customer}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{chargeback.reason}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full ${styles.bg} ${styles.text}`}>
                        <StatusIcon className="w-3 h-3" />
                        {chargeback.status.charAt(0).toUpperCase() + chargeback.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {chargeback.status === "open" ? (
                        <span className="text-red-600 font-medium">{chargeback.deadline}</span>
                      ) : (
                        chargeback.deadline
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-medium text-gray-900">${chargeback.amount}</td>
                    <td className="px-6 py-4 text-right">
                      {chargeback.status === "open" && (
                        <Link to={`/venue/financials/chargebacks/${chargeback.id}`}>
                          <Button size="sm">Respond</Button>
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Mail, RefreshCw } from "lucide-react";
import { Button, Modal, ModalFooter, Select, Textarea, useToast, ToastContainer } from "../../components/ui";

const mockTransactions: Record<string, any> = {
  "TXN-001": {
    id: "TXN-001",
    type: "sale",
    status: "completed",
    date: "Jun 29, 2025 2:34 PM",
    customer: { name: "John Smith", email: "john@email.com" },
    event: { name: "Summer Music Festival", date: "Jul 15, 2025" },
    items: [
      { name: "VIP Access", quantity: 2, price: 150, total: 300 },
    ],
    subtotal: 300,
    fees: 15,
    discount: 0,
    total: 315,
    paymentMethod: "Visa ****4242",
    relatedTransactions: [],
  },
  "TXN-003": {
    id: "TXN-003",
    type: "refund",
    status: "completed",
    date: "Jun 29, 2025 11:30 AM",
    customer: { name: "Mike Chen", email: "mike@email.com" },
    event: { name: "Tech Conference", date: "Sep 15, 2025" },
    items: [
      { name: "Premium Pass", quantity: 1, price: 150, total: 150 },
    ],
    subtotal: -150,
    fees: 0,
    discount: 0,
    total: -150,
    paymentMethod: "Visa ****1234",
    relatedTransactions: [
      { id: "TXN-012", type: "sale", amount: 150, date: "Jun 15, 2025" }
    ],
    refundReason: "Unable to attend",
  },
};

const refundReasons = [
  { value: "unable-to-attend", label: "Unable to attend" },
  { value: "event-cancelled", label: "Event cancelled" },
  { value: "duplicate-purchase", label: "Duplicate purchase" },
  { value: "customer-request", label: "Customer request" },
  { value: "other", label: "Other" },
];

function getTypeStyles(type: string) {
  switch (type) {
    case "sale": return { bg: "bg-green-100", text: "text-green-700", label: "Sale" };
    case "refund": return { bg: "bg-red-100", text: "text-red-700", label: "Refund" };
    default: return { bg: "bg-gray-100", text: "text-gray-700", label: type };
  }
}

export default function TransactionDetail() {
  const { id } = useParams();
  const toast = useToast();
  const transaction = mockTransactions[id || "TXN-001"] || mockTransactions["TXN-001"];

  const [showRefundModal, setShowRefundModal] = useState(false);
  const [refundForm, setRefundForm] = useState({
    type: "full",
    reason: "customer-request",
    notes: "",
  });

  const handleRefund = () => {
    toast.success("Refund processed successfully!");
    setShowRefundModal(false);
  };

  const handleContactCustomer = () => {
    window.location.href = `mailto:${transaction.customer.email}`;
  };

  const styles = getTypeStyles(transaction.type);

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/financials/transactions" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{transaction.id}</h1>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${styles.bg} ${styles.text}`}>
                {styles.label}
              </span>
              <span className="px-3 py-1 text-sm font-medium rounded-full bg-green-100 text-green-700">
                {transaction.status.charAt(0).toUpperCase() + transaction.status.slice(1)}
              </span>
            </div>
            <p className="text-gray-500">{transaction.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleContactCustomer}>
            <Mail className="w-4 h-4" />
            Contact Customer
          </Button>
          {transaction.type === "sale" && (
            <Button variant="danger" onClick={() => setShowRefundModal(true)}>
              <RefreshCw className="w-4 h-4" />
              Issue Refund
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Customer Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Name</p>
              <p className="font-medium text-gray-900">{transaction.customer.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium text-gray-900">{transaction.customer.email}</p>
            </div>
          </div>
        </div>

        {/* Event Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Event Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Event</p>
              <p className="font-medium text-gray-900">{transaction.event.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Date</p>
              <p className="font-medium text-gray-900">{transaction.event.date}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Items Purchased */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Items</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {transaction.items.map((item: any, index: number) => (
              <tr key={index}>
                <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                <td className="px-6 py-4 text-right text-gray-600">{item.quantity}</td>
                <td className="px-6 py-4 text-right text-gray-600">${item.price}</td>
                <td className="px-6 py-4 text-right font-medium text-gray-900">${item.total}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Payment Breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Payment Breakdown</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Subtotal</span>
            <span className="text-gray-900">${Math.abs(transaction.subtotal).toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Fees</span>
            <span className="text-gray-900">${transaction.fees.toLocaleString()}</span>
          </div>
          {transaction.discount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-gray-600">Discount</span>
              <span className="text-green-600">-${transaction.discount.toLocaleString()}</span>
            </div>
          )}
          <div className="border-t pt-2 flex items-center justify-between">
            <span className="font-semibold text-gray-900">Total</span>
            <span className={`text-xl font-bold ${transaction.total >= 0 ? "text-green-600" : "text-red-600"}`}>
              {transaction.total >= 0 ? "" : "-"}${Math.abs(transaction.total).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t">
          <p className="text-sm text-gray-500">Payment Method</p>
          <p className="font-medium text-gray-900">{transaction.paymentMethod}</p>
        </div>
      </div>

      {/* Related Transactions */}
      {transaction.relatedTransactions.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Related Transactions</h2>
          <div className="space-y-2">
            {transaction.relatedTransactions.map((related: any) => (
              <Link 
                key={related.id} 
                to={`/venue/financials/transactions/${related.id}`}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
              >
                <div>
                  <span className="font-medium text-purple-600">{related.id}</span>
                  <span className="text-gray-500 ml-2">• {related.type} • {related.date}</span>
                </div>
                <span className="font-medium text-gray-900">${related.amount}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Refund Modal */}
      <Modal
        isOpen={showRefundModal}
        onClose={() => setShowRefundModal(false)}
        title="Issue Refund"
      >
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="font-medium text-gray-900">{transaction.id}</p>
            <p className="text-sm text-gray-600">Original amount: ${Math.abs(transaction.total)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Refund Type</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refundType"
                  value="full"
                  checked={refundForm.type === "full"}
                  onChange={(e) => setRefundForm({ ...refundForm, type: e.target.value })}
                  className="text-purple-600"
                />
                <span>Full Refund (${Math.abs(transaction.total)})</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="refundType"
                  value="partial"
                  checked={refundForm.type === "partial"}
                  onChange={(e) => setRefundForm({ ...refundForm, type: e.target.value })}
                  className="text-purple-600"
                />
                <span>Partial Refund</span>
              </label>
            </div>
          </div>

          <Select
            label="Reason"
            options={refundReasons}
            value={refundForm.reason}
            onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
          />

          <Textarea
            label="Notes (optional)"
            value={refundForm.notes}
            onChange={(e) => setRefundForm({ ...refundForm, notes: e.target.value })}
            rows={3}
            placeholder="Add any additional notes..."
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowRefundModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleRefund}>Process Refund</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

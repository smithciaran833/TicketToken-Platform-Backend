import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Mail, ExternalLink } from "lucide-react";
import { Button } from "../../components/ui";

const mockRefunds: Record<string, any> = {
  "REF-001": {
    id: "REF-001",
    orderId: "ORD-1234",
    status: "completed",
    date: "Jun 29, 2025 3:45 PM",
    processedBy: "Sarah Johnson",
    customer: { name: "Mike Chen", email: "mike@email.com", phone: "+1 (555) 123-4567" },
    event: { name: "Tech Conference: Innovation Summit", date: "Sep 15, 2025" },
    items: [
      { name: "Premium Pass", quantity: 1, price: 150 },
    ],
    originalAmount: 157.50,
    refundAmount: 150.00,
    feesRefunded: 0,
    netRefund: 150.00,
    reason: "Unable to attend",
    notes: "Customer requested refund due to scheduling conflict. Approved per standard refund policy.",
    paymentMethod: "Visa ****1234",
  },
  "REF-002": {
    id: "REF-002",
    orderId: "ORD-1456",
    status: "completed",
    date: "Jun 27, 2025 10:20 AM",
    processedBy: "System (Auto)",
    customer: { name: "Tom Harris", email: "tom@email.com", phone: "+1 (555) 987-6543" },
    event: { name: "Summer Music Festival", date: "Jul 15, 2025" },
    items: [
      { name: "General Admission", quantity: 1, price: 65 },
    ],
    originalAmount: 68.25,
    refundAmount: 65.00,
    feesRefunded: 3.25,
    netRefund: 68.25,
    reason: "Duplicate purchase",
    notes: "Customer accidentally purchased twice. Full refund including fees approved.",
    paymentMethod: "Mastercard ****5678",
  },
  "REF-003": {
    id: "REF-003",
    orderId: "ORD-1589",
    status: "pending",
    date: "Jun 26, 2025 2:15 PM",
    processedBy: "Pending",
    customer: { name: "Lisa Brown", email: "lisa@email.com", phone: "+1 (555) 456-7890" },
    event: { name: "Jazz Night", date: "Jul 20, 2025" },
    items: [
      { name: "VIP Table", quantity: 1, price: 100 },
    ],
    originalAmount: 105.00,
    refundAmount: 100.00,
    feesRefunded: 0,
    netRefund: 100.00,
    reason: "Event cancelled",
    notes: "Event cancelled by venue. Auto-refund in progress.",
    paymentMethod: "Amex ****9012",
  },
};

function getStatusStyles(status: string) {
  switch (status) {
    case "completed": return { bg: "bg-green-100", text: "text-green-700", label: "Completed" };
    case "pending": return { bg: "bg-yellow-100", text: "text-yellow-700", label: "Pending" };
    case "failed": return { bg: "bg-red-100", text: "text-red-700", label: "Failed" };
    default: return { bg: "bg-gray-100", text: "text-gray-700", label: status };
  }
}

export default function RefundDetail() {
  const { id } = useParams();
  const refund = mockRefunds[id || "REF-001"] || mockRefunds["REF-001"];
  const statusStyles = getStatusStyles(refund.status);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/financials/refunds" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{refund.id}</h1>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${statusStyles.bg} ${statusStyles.text}`}>
                {statusStyles.label}
              </span>
            </div>
            <p className="text-gray-500">{refund.date}</p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => window.location.href = `mailto:${refund.customer.email}`}>
          <Mail className="w-4 h-4" />
          Contact Customer
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Customer Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Name</p>
              <p className="font-medium text-gray-900">{refund.customer.name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Email</p>
              <p className="font-medium text-gray-900">{refund.customer.email}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Phone</p>
              <p className="font-medium text-gray-900">{refund.customer.phone}</p>
            </div>
          </div>
        </div>

        {/* Event & Order Info */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Order Information</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-gray-500">Original Order</p>
              <Link 
                to={`/venue/financials/transactions/${refund.orderId}`}
                className="font-medium text-purple-600 hover:text-purple-700 inline-flex items-center gap-1"
              >
                {refund.orderId}
                <ExternalLink className="w-3 h-3" />
              </Link>
            </div>
            <div>
              <p className="text-sm text-gray-500">Event</p>
              <p className="font-medium text-gray-900">{refund.event.name}</p>
              <p className="text-sm text-gray-500">{refund.event.date}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Payment Method</p>
              <p className="font-medium text-gray-900">{refund.paymentMethod}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Items Refunded */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Items Refunded</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Qty</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Price</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Refund</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {refund.items.map((item: any, index: number) => (
              <tr key={index}>
                <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                <td className="px-6 py-4 text-right text-gray-600">{item.quantity}</td>
                <td className="px-6 py-4 text-right text-gray-600">${item.price.toFixed(2)}</td>
                <td className="px-6 py-4 text-right font-medium text-red-600">-${(item.price * item.quantity).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Refund Breakdown */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Refund Breakdown</h2>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Original Order Total</span>
            <span className="text-gray-900">${refund.originalAmount.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Ticket Refund</span>
            <span className="text-red-600">-${refund.refundAmount.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-600">Fees Refunded</span>
            <span className={refund.feesRefunded > 0 ? "text-red-600" : "text-gray-500"}>
              {refund.feesRefunded > 0 ? `-$${refund.feesRefunded.toFixed(2)}` : "$0.00"}
            </span>
          </div>
          <div className="border-t pt-2 flex items-center justify-between">
            <span className="font-semibold text-gray-900">Total Refunded</span>
            <span className="text-xl font-bold text-red-600">-${refund.netRefund.toFixed(2)}</span>
          </div>
        </div>
      </div>

      {/* Reason & Notes */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Refund Details</h2>
        <div className="space-y-4">
          <div>
            <p className="text-sm text-gray-500 mb-1">Reason</p>
            <span className="inline-flex px-2 py-1 text-sm font-medium rounded-full bg-gray-100 text-gray-700">
              {refund.reason}
            </span>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Notes</p>
            <p className="text-gray-700">{refund.notes}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Processed By</p>
            <p className="font-medium text-gray-900">{refund.processedBy}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

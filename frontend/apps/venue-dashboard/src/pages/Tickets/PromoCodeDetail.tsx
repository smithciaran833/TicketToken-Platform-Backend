import { useState } from "react";
import { ArrowLeft, Edit, Ban } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Button, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const mockPromoCodes: Record<number, any> = {
  1: { id: 1, code: "SUMMER20", discountType: "percentage", discountValue: 20, event: "All Events", eventId: null, uses: 145, maxUses: 500, usesPerCustomer: null, validFrom: "2025-06-01", validUntil: "2025-08-01", status: "Active", ticketType: "All Ticket Types", revenueImpact: 4350 },
  2: { id: 2, code: "VIPFRIEND", discountType: "fixed", discountValue: 50, event: "Summer Music Festival", eventId: 1, uses: 23, maxUses: 100, usesPerCustomer: 1, validFrom: "2025-06-01", validUntil: "2025-07-15", status: "Active", ticketType: "VIP Access", revenueImpact: 1150 },
  3: { id: 3, code: "EARLYBIRD", discountType: "percentage", discountValue: 15, event: "All Events", eventId: null, uses: 300, maxUses: 300, usesPerCustomer: null, validFrom: "2025-04-01", validUntil: "2025-06-01", status: "Expired", ticketType: "All Ticket Types", revenueImpact: 2925 },
  5: { id: 5, code: "FREETICKET", discountType: "free", discountValue: 1, event: "Jazz Night", eventId: 5, uses: 5, maxUses: 20, usesPerCustomer: 1, validFrom: "2025-06-01", validUntil: "2025-07-20", status: "Active", ticketType: "General Admission", revenueImpact: 175 },
};

const mockUsageHistory = [
  { id: 1, orderId: "ORD-001", customer: "John Smith", email: "john@email.com", date: "Jun 28, 2025", discount: 13.00 },
  { id: 2, orderId: "ORD-002", customer: "Sarah Johnson", email: "sarah@email.com", date: "Jun 27, 2025", discount: 26.00 },
  { id: 3, orderId: "ORD-003", customer: "Mike Chen", email: "mike@email.com", date: "Jun 26, 2025", discount: 30.00 },
  { id: 4, orderId: "ORD-004", customer: "Emily Davis", email: "emily@email.com", date: "Jun 25, 2025", discount: 13.00 },
  { id: 5, orderId: "ORD-005", customer: "Alex Wilson", email: "alex@email.com", date: "Jun 24, 2025", discount: 19.50 },
];

function getStatusClasses(status: string) {
  switch (status) {
    case "Active": return "bg-green-100 text-green-700";
    case "Expired": return "bg-gray-100 text-gray-700";
    case "Scheduled": return "bg-yellow-100 text-yellow-700";
    case "Deactivated": return "bg-red-100 text-red-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

function formatDiscount(type: string, value: number) {
  if (type === "percentage") return `${value}% off`;
  if (type === "fixed") return `$${value} off`;
  if (type === "free") return `${value} Free Ticket${value > 1 ? "s" : ""}`;
  return value.toString();
}

export default function PromoCodeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const promoId = parseInt(id || "1");
  const promo = mockPromoCodes[promoId];

  const [showDeactivateModal, setShowDeactivateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const copyCode = () => {
    navigator.clipboard.writeText(promo.code);
    toast.success("Code copied to clipboard!");
  };

  const handleDeactivate = () => {
    toast.success("Promo code deactivated");
    setShowDeactivateModal(false);
  };

  const handleDelete = () => {
    toast.success("Promo code deleted");
    navigate("/venue/tickets/promos");
  };

  if (!promo) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Promo code not found</p>
        <Link to="/venue/tickets/promos" className="text-purple-600 hover:text-purple-700 mt-2 inline-block">
          Back to Promo Codes
        </Link>
      </div>
    );
  }

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/tickets/promos" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">{promo.code}</h1>
              <span className={"px-3 py-1 text-sm font-medium rounded-full " + getStatusClasses(promo.status)}>
                {promo.status}
              </span>
            </div>
            <p className="text-gray-500">{formatDiscount(promo.discountType, promo.discountValue)}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/venue/tickets/promos/${promo.id}/edit`}>
            <Button variant="secondary">
              <Edit className="w-4 h-4" />
              Edit
            </Button>
          </Link>
          {promo.status === "Active" && (
            <Button variant="secondary" onClick={() => setShowDeactivateModal(true)}>
              <Ban className="w-4 h-4" />
              Deactivate
            </Button>
          )}
        </div>
      </div>

      {/* Code Display */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-6 mb-6 text-center">
        <button
          onClick={copyCode}
          className="font-mono text-4xl font-bold text-purple-600 hover:text-purple-700 transition-colors"
        >
          {promo.code}
        </button>
        <p className="text-sm text-purple-600 mt-2">Click to copy</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Times Used</p>
          <p className="text-2xl font-bold text-gray-900">{promo.uses}</p>
          {promo.maxUses && (
            <div className="mt-2">
              <div className="w-full h-2 bg-gray-200 rounded-full">
                <div className="h-2 bg-purple-600 rounded-full" style={{ width: `${(promo.uses / promo.maxUses) * 100}%` }} />
              </div>
              <p className="text-xs text-gray-500 mt-1">{promo.maxUses - promo.uses} remaining</p>
            </div>
          )}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Revenue Impact</p>
          <p className="text-2xl font-bold text-red-600">-${promo.revenueImpact.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total discounts given</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Valid Until</p>
          <p className="text-2xl font-bold text-gray-900">{promo.validUntil}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Applies To</p>
          <p className="text-lg font-bold text-gray-900">{promo.event}</p>
          <p className="text-xs text-gray-500">{promo.ticketType}</p>
        </div>
      </div>

      {/* Settings Summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Settings</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-gray-500">Discount</p>
            <p className="font-medium">{formatDiscount(promo.discountType, promo.discountValue)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Max Uses</p>
            <p className="font-medium">{promo.maxUses || "Unlimited"}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Uses Per Customer</p>
            <p className="font-medium">{promo.usesPerCustomer || "Unlimited"}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Valid Period</p>
            <p className="font-medium">{promo.validFrom} - {promo.validUntil}</p>
          </div>
        </div>
      </div>

      {/* Usage History */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Usage History</h2>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Discount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {mockUsageHistory.map((usage) => (
              <tr key={usage.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-medium text-purple-600">{usage.orderId}</td>
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{usage.customer}</div>
                  <div className="text-sm text-gray-500">{usage.email}</div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{usage.date}</td>
                <td className="px-6 py-4 text-sm font-medium text-red-600 text-right">-${usage.discount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Deactivate Modal */}
      <Modal isOpen={showDeactivateModal} onClose={() => setShowDeactivateModal(false)} title="Deactivate Promo Code" size="sm">
        <p className="text-gray-600">
          Are you sure you want to deactivate <strong>{promo.code}</strong>? 
          Customers will no longer be able to use this code.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeactivateModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeactivate}>Deactivate</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Modal */}
      <Modal isOpen={showDeleteModal} onClose={() => setShowDeleteModal(false)} title="Delete Promo Code" size="sm">
        <p className="text-gray-600">Are you sure you want to delete <strong>{promo.code}</strong>?</p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, AlertCircle, CheckCircle } from "lucide-react";

const mockOrder = {
  eventTitle: "Japanese Breakfast",
  items: [
    { id: "1", name: "General Admission", quantity: 2, price: 45.00, refundable: true },
    { id: "2", name: "General Parking", quantity: 1, price: 25.00, refundable: true },
  ],
  refundPolicy: "Full refunds available up to 7 days before the event. 50% refund available 3-7 days before. No refunds within 3 days of the event.",
  isEligible: true,
  refundDeadline: "July 8, 2025",
};

const refundReasons = [
  "Can't attend - schedule conflict",
  "Can't attend - illness",
  "Event was rescheduled",
  "Purchased wrong tickets",
  "Found better tickets",
  "Other",
];

export default function RequestRefund() {
  const { orderId: _orderId } = useParams();
  const navigate = useNavigate();
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleItem = (itemId: string) => {
    setSelectedItems((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId]
    );
  };

  const selectedTotal = mockOrder.items
    .filter((item) => selectedItems.includes(item.id))
    .reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleSubmit = async () => {
    if (selectedItems.length === 0 || !reason) return;

    setIsSubmitting(true);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    navigate("/tickets/orders", { state: { refundRequested: true } });
  };

  const isValid = selectedItems.length > 0 && reason;

  if (!mockOrder.isEligible) {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Request Refund</h1>
          </div>
        </header>

        <div className="px-5 py-12 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Not Eligible for Refund</h2>
          <p className="text-gray-500 mb-6 max-w-xs mx-auto">
            This order is no longer eligible for a refund based on the event's refund policy.
          </p>
          <button
            onClick={() => navigate("/support/contact")}
            className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
          >
            Contact Support
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-32">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Request Refund</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Refund Policy */}
        <div className="bg-blue-50 rounded-xl p-4">
          <h3 className="font-semibold text-blue-900 mb-2">Refund Policy</h3>
          <p className="text-sm text-blue-800">{mockOrder.refundPolicy}</p>
          <p className="text-sm text-blue-700 font-medium mt-2">
            Refund deadline: {mockOrder.refundDeadline}
          </p>
        </div>

        {/* Select Items */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Select Items to Refund
          </h3>
          <div className="space-y-2">
            {mockOrder.items.map((item) => (
              <button
                key={item.id}
                onClick={() => item.refundable && toggleItem(item.id)}
                disabled={!item.refundable}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors ${
                  selectedItems.includes(item.id)
                    ? "border-purple-600 bg-purple-50"
                    : item.refundable
                    ? "border-gray-200 bg-white hover:border-gray-300"
                    : "border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    selectedItems.includes(item.id)
                      ? "border-purple-600 bg-purple-600"
                      : "border-gray-300"
                  }`}
                >
                  {selectedItems.includes(item.id) && (
                    <CheckCircle className="w-4 h-4 text-white" />
                  )}
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-gray-900">{item.name}</p>
                  <p className="text-sm text-gray-500">Qty: {item.quantity}</p>
                </div>
                <p className="font-semibold text-gray-900">
                  ${(item.price * item.quantity).toFixed(2)}
                </p>
              </button>
            ))}
          </div>
        </div>

        {/* Reason */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Reason for Refund
          </h3>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Select a reason...</option>
            {refundReasons.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        {/* Additional Notes */}
        <div>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Additional Notes (Optional)
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any additional details..."
            rows={3}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
          />
        </div>
      </div>

      {/* Submit Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-5 py-4">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-600">Refund Amount</span>
          <span className="text-xl font-bold text-gray-900">${selectedTotal.toFixed(2)}</span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
            isValid && !isSubmitting
              ? "bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isSubmitting ? "Submitting..." : "Submit Request"}
        </button>
      </div>
    </div>
  );
}

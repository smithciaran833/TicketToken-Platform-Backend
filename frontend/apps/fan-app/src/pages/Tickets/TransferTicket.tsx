import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, User, Mail, Phone, AlertTriangle } from "lucide-react";

const mockTicket = {
  eventTitle: "Japanese Breakfast",
  date: "Sat, Jul 15, 2025",
  ticketType: "General Admission",
  section: "Floor",
};

export default function TransferTicket() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [transferMethod, setTransferMethod] = useState<"email" | "phone">("email");
  const [recipient, setRecipient] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!recipient.trim()) return;

    setIsSubmitting(true);
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));
    navigate(`/tickets/${id}/transfer/confirmation`, {
      state: { recipient, method: transferMethod },
    });
  };

  const isValid = recipient.trim().length > 0;

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Transfer Ticket</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        {/* Ticket Summary */}
        <div className="bg-gray-50 rounded-xl p-4 mb-6">
          <h2 className="font-semibold text-gray-900">{mockTicket.eventTitle}</h2>
          <p className="text-sm text-gray-500">{mockTicket.date}</p>
          <p className="text-sm text-purple-600 font-medium mt-1">
            {mockTicket.ticketType} · {mockTicket.section}
          </p>
        </div>

        {/* Transfer Method */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
            Send To
          </label>
          <div className="flex gap-2">
            <button
              onClick={() => setTransferMethod("email")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors ${
                transferMethod === "email"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Mail className="w-5 h-5" />
              Email
            </button>
            <button
              onClick={() => setTransferMethod("phone")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-medium transition-colors ${
                transferMethod === "phone"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <Phone className="w-5 h-5" />
              Phone
            </button>
          </div>
        </div>

        {/* Recipient Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {transferMethod === "email" ? "Recipient's Email" : "Recipient's Phone"}
          </label>
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2">
              {transferMethod === "email" ? (
                <Mail className="w-5 h-5 text-gray-400" />
              ) : (
                <Phone className="w-5 h-5 text-gray-400" />
              )}
            </div>
            <input
              type={transferMethod === "email" ? "email" : "tel"}
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder={
                transferMethod === "email" ? "friend@example.com" : "(555) 123-4567"
              }
              className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Personal Message */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Personal Message (Optional)
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Add a message to the recipient..."
            rows={3}
            maxLength={200}
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
          />
          <p className="text-sm text-gray-400 mt-1">{message.length}/200</p>
        </div>

        {/* Transfer Info */}
        <div className="bg-blue-50 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <User className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-blue-800">
                The recipient will receive an email with instructions to claim this ticket.
                They'll need to create an account if they don't have one.
              </p>
            </div>
          </div>
        </div>

        {/* Warning */}
        <div className="bg-amber-50 rounded-xl p-4 mb-8">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">This action cannot be undone</p>
              <p className="text-sm text-amber-700 mt-1">
                Once transferred, you will no longer have access to this ticket.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-5 py-4">
        <button
          onClick={handleSubmit}
          disabled={!isValid || isSubmitting}
          className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
            isValid && !isSubmitting
              ? "bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed"
          }`}
        >
          {isSubmitting ? "Transferring..." : "Transfer Ticket"}
        </button>
      </div>
    </div>
  );
}

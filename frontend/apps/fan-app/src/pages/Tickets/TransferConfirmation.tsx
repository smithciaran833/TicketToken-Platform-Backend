import { useLocation, useNavigate } from "react-router-dom";
import { CheckCircle, Mail, Phone } from "lucide-react";

export default function TransferConfirmation() {
  const navigate = useNavigate();
  const location = useLocation();
  const { recipient, method } = (location.state as { recipient: string; method: string }) || {
    recipient: "friend@example.com",
    method: "email",
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-12">
        {/* Success Icon */}
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-6">
          <CheckCircle className="w-10 h-10 text-green-600" />
        </div>

        {/* Success Message */}
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Ticket Transferred!</h1>
        <p className="text-gray-500 text-center max-w-xs">
          Your ticket has been sent successfully
        </p>

        {/* Recipient Info */}
        <div className="mt-8 bg-gray-50 rounded-xl p-4 w-full max-w-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
              {method === "email" ? (
                <Mail className="w-5 h-5 text-purple-600" />
              ) : (
                <Phone className="w-5 h-5 text-purple-600" />
              )}
            </div>
            <div>
              <p className="text-sm text-gray-500">Sent to</p>
              <p className="font-medium text-gray-900">{recipient}</p>
            </div>
          </div>
        </div>

        {/* Info Text */}
        <p className="text-sm text-gray-500 text-center mt-6 max-w-xs">
          They'll receive an {method === "email" ? "email" : "SMS"} with instructions to claim the ticket.
        </p>
      </div>

      {/* Done Button */}
      <div className="px-5 py-4 border-t border-gray-200">
        <button
          onClick={() => navigate("/tickets")}
          className="w-full py-3.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all"
        >
          Done
        </button>
      </div>
    </div>
  );
}

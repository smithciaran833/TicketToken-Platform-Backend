import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Terms of Service</h1>
        </div>
      </header>

      <div className="px-5 py-6 prose prose-gray max-w-none">
        <p className="text-sm text-gray-500">Effective Date: January 1, 2025</p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">1. Acceptance of Terms</h2>
        <p className="text-gray-600">
          By accessing or using the TicketToken platform ("Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use our Service.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">2. Description of Service</h2>
        <p className="text-gray-600">
          TicketToken provides a platform for purchasing, selling, and transferring event tickets. Tickets purchased through our platform are issued as blockchain-verified digital assets.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">3. User Accounts</h2>
        <p className="text-gray-600">
          You must create an account to use certain features of the Service. You are responsible for maintaining the confidentiality of your account credentials and for all activities under your account.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">4. Ticket Purchases</h2>
        <p className="text-gray-600">
          All ticket sales are final unless otherwise stated in the event's refund policy. Prices are displayed in USD and include applicable fees unless otherwise noted.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">5. Resale Marketplace</h2>
        <p className="text-gray-600">
          Users may resell tickets through our marketplace subject to our Resale Terms. Maximum resale prices may be capped at a percentage of face value as determined by event organizers.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">6. Prohibited Conduct</h2>
        <p className="text-gray-600">
          You may not use the Service for any unlawful purpose, attempt to circumvent security measures, or engage in fraudulent activity including ticket scalping outside our platform.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">7. Limitation of Liability</h2>
        <p className="text-gray-600">
          TicketToken is not liable for event cancellations, venue changes, or other circumstances beyond our control. Our liability is limited to the ticket purchase price.
        </p>

        <h2 className="text-lg font-bold text-gray-900 mt-6">8. Contact</h2>
        <p className="text-gray-600">
          For questions about these Terms, please contact us at legal@tickettoken.com.
        </p>
      </div>
    </div>
  );
}

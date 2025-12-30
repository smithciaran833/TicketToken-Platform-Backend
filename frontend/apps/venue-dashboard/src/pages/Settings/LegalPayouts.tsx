import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Wallet, CheckCircle, ExternalLink, CreditCard, Building } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

export default function LegalPayouts() {
  const toast = useToast();
  const [isConnected] = useState(true);

  const accountInfo = {
    businessName: "Grand Theater Entertainment LLC",
    email: "finance@grandtheater.com",
    bankLast4: "4567",
    bankName: "Chase Bank",
    payoutSchedule: "Weekly (Monday)",
    status: "verified",
  };

  const handleUpdateAccount = () => {
    toast.success("Redirecting to Stripe...");
  };

  const handleConnect = () => {
    toast.success("Starting Stripe Connect flow...");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payout Setup</h1>
          <p className="text-gray-500">Manage your payment account</p>
        </div>
      </div>

      {isConnected ? (
        <>
          {/* Connection Status */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-green-900">Stripe Connected</h2>
                <p className="text-sm text-green-700">Your account is verified and ready to receive payouts.</p>
              </div>
              <Button variant="secondary" onClick={handleUpdateAccount}>
                <ExternalLink className="w-4 h-4" />
                Update Account
              </Button>
            </div>
          </div>

          {/* Account Info */}
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Account Information</h2>

            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Building className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-600">Business Name</span>
                </div>
                <span className="font-medium text-gray-900">{accountInfo.businessName}</span>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-600">Bank Account</span>
                </div>
                <span className="font-medium text-gray-900">{accountInfo.bankName} •••• {accountInfo.bankLast4}</span>
              </div>

              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <div className="flex items-center gap-3">
                  <Wallet className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-600">Payout Schedule</span>
                </div>
                <span className="font-medium text-gray-900">{accountInfo.payoutSchedule}</span>
              </div>

              <div className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-gray-400" />
                  <span className="text-gray-600">Verification Status</span>
                </div>
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                  Verified
                </span>
              </div>
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid grid-cols-2 gap-4">
            <Link to="/venue/financials/payouts" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
              <Wallet className="w-5 h-5 text-gray-400 mb-2" />
              <p className="font-medium text-gray-900">View Payouts</p>
              <p className="text-sm text-gray-500">See payout history</p>
            </Link>
            <Link to="/venue/financials/transactions" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
              <CreditCard className="w-5 h-5 text-gray-400 mb-2" />
              <p className="font-medium text-gray-900">Transactions</p>
              <p className="text-sm text-gray-500">View all transactions</p>
            </Link>
          </div>
        </>
      ) : (
        <>
          {/* Not Connected */}
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Wallet className="w-8 h-8 text-purple-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Connect with Stripe</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Connect your Stripe account to start receiving payouts from ticket sales. 
              Stripe handles secure payment processing and direct deposits to your bank account.
            </p>

            <div className="space-y-4 text-left max-w-md mx-auto mb-6">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Secure Payments</p>
                  <p className="text-sm text-gray-500">PCI-compliant payment processing</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Fast Payouts</p>
                  <p className="text-sm text-gray-500">Weekly or daily deposits to your bank</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-gray-900">Detailed Reporting</p>
                  <p className="text-sm text-gray-500">Track every transaction and payout</p>
                </div>
              </div>
            </div>

            <Button size="lg" onClick={handleConnect}>
              Connect with Stripe
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

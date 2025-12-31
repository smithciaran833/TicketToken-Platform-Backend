import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Clock, FileText, ChevronRight, CheckCircle } from "lucide-react";

const mockSellerAccount = {
  stripeConnected: true,
  bankAccount: {
    name: "Chase Checking",
    last4: "4567",
  },
  payoutSchedule: "Weekly on Fridays",
  taxFormAvailable: true,
  totalEarnings: 245.50,
  pendingPayout: 49.50,
};

export default function SellerAccountSettings() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Seller Account</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Status */}
        <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-green-800">Account Active</p>
            <p className="text-sm text-green-700">You can receive payouts</p>
          </div>
        </div>

        {/* Earnings Summary */}
        <div className="bg-white rounded-xl p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Earnings
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500">Total Earnings</p>
              <p className="text-2xl font-bold text-gray-900">${mockSellerAccount.totalEarnings.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Payout</p>
              <p className="text-2xl font-bold text-green-600">${mockSellerAccount.pendingPayout.toFixed(2)}</p>
            </div>
          </div>
        </div>

        {/* Bank Account */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Bank Account
            </h3>
          </div>
          <Link
            to="/sell/settings/bank"
            className="flex items-center gap-4 p-5 hover:bg-gray-50 transition-colors"
          >
            <div className="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-gray-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{mockSellerAccount.bankAccount.name}</p>
              <p className="text-sm text-gray-500">•••• {mockSellerAccount.bankAccount.last4}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Link>
        </div>

        {/* Payout Schedule */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Payout Schedule
            </h3>
          </div>
          <div className="flex items-center gap-4 p-5">
            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
              <Clock className="w-6 h-6 text-purple-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900">{mockSellerAccount.payoutSchedule}</p>
              <p className="text-sm text-gray-500">Automatic payouts enabled</p>
            </div>
          </div>
        </div>

        {/* Links */}
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          <Link
            to="/sell/payouts"
            className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
          >
            <span className="font-medium text-gray-900">View Payout History</span>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </Link>
          {mockSellerAccount.taxFormAvailable && (
            <Link
              to="/sell/settings/tax"
              className="flex items-center justify-between p-5 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-gray-400" />
                <span className="font-medium text-gray-900">Tax Documents (1099)</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

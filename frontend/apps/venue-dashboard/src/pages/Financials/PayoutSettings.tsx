import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ExternalLink, CheckCircle, AlertTriangle } from "lucide-react";
import { Button, Toggle, useToast, ToastContainer } from "../../components/ui";

export default function PayoutSettings() {
  const toast = useToast();

  const [stripeConnected] = useState(true);
  const [stripeAccount] = useState({
    accountId: "acct_1234567890",
    businessName: "Awesome Venues LLC",
    payoutsEnabled: true,
    defaultCurrency: "USD",
  });

  const [notifications, setNotifications] = useState({
    emailOnPayout: true,
    emailOnFailed: true,
  });

  const handleSaveNotifications = () => {
    toast.success("Notification preferences saved!");
  };

  const openStripeDashboard = () => {
    window.open("https://dashboard.stripe.com/settings/payouts", "_blank");
  };

  const openStripeConnect = () => {
    window.open("https://connect.stripe.com/setup", "_blank");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/financials/payouts" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payout Settings</h1>
          <p className="text-gray-500">Manage your Stripe Connect account and preferences</p>
        </div>
      </div>

      {/* Stripe Connect Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Stripe Connect</h2>
        
        {stripeConnected ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="font-medium text-green-700">Account Connected</p>
                <p className="text-sm text-gray-500">{stripeAccount.businessName}</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500">Account ID</p>
                  <p className="font-mono text-gray-900">{stripeAccount.accountId}</p>
                </div>
                <div>
                  <p className="text-gray-500">Payouts Status</p>
                  <p className="text-green-600 font-medium">
                    {stripeAccount.payoutsEnabled ? "Enabled" : "Pending Verification"}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500">Default Currency</p>
                  <p className="text-gray-900">{stripeAccount.defaultCurrency}</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button variant="secondary" onClick={openStripeDashboard}>
                <ExternalLink className="w-4 h-4" />
                Open Stripe Dashboard
              </Button>
              <p className="text-sm text-gray-500">
                Manage bank accounts, payout schedule, and more in Stripe
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800">Connect Your Stripe Account</p>
                <p className="text-sm text-yellow-700 mb-3">
                  Connect a Stripe account to receive payouts from ticket sales.
                </p>
                <Button onClick={openStripeConnect}>
                  Connect with Stripe
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Payout Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-blue-800">
          <strong>How payouts work:</strong> All payments are processed through Stripe. 
          Your payout schedule, bank account details, and payout history are managed directly in your Stripe dashboard. 
          We display transaction summaries here for your convenience.
        </p>
      </div>

      {/* Notification Preferences */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Notification Preferences</h2>
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Email on successful payout</p>
              <p className="text-sm text-gray-500">Get notified when Stripe deposits funds</p>
            </div>
            <Toggle
              enabled={notifications.emailOnPayout}
              onChange={(val) => setNotifications({ ...notifications, emailOnPayout: val })}
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div>
              <p className="font-medium text-gray-900">Email on failed payout</p>
              <p className="text-sm text-gray-500">Get notified if a payout fails</p>
            </div>
            <Toggle
              enabled={notifications.emailOnFailed}
              onChange={(val) => setNotifications({ ...notifications, emailOnFailed: val })}
            />
          </div>
        </div>

        <div className="mt-4 pt-4 border-t">
          <Button onClick={handleSaveNotifications}>Save Preferences</Button>
        </div>
      </div>

      {/* Quick Links */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Stripe Resources</h2>
        <div className="space-y-2">
          <a 
            href="https://dashboard.stripe.com/settings/payouts" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <span className="text-gray-900">Payout Schedule & Bank Accounts</span>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
          <a 
            href="https://dashboard.stripe.com/balance/overview" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <span className="text-gray-900">Balance & Transactions</span>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
          <a 
            href="https://dashboard.stripe.com/settings/account" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <span className="text-gray-900">Account Settings</span>
            <ExternalLink className="w-4 h-4 text-gray-400" />
          </a>
        </div>
      </div>
    </div>
  );
}

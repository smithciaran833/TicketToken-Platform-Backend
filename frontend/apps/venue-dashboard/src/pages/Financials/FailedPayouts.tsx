import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, AlertTriangle, RefreshCw, CreditCard, HelpCircle } from "lucide-react";
import { Button, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const failedPayouts = [
  { 
    id: "PAY-F001", 
    amount: 2450.00, 
    date: "Jun 28, 2025", 
    bankAccount: "****4523",
    bankName: "Chase",
    reason: "Insufficient funds in connected account",
    resolution: "Ensure your Stripe balance covers the payout amount",
    canRetry: true 
  },
  { 
    id: "PAY-F002", 
    amount: 890.50, 
    date: "Jun 25, 2025", 
    bankAccount: "****7891",
    bankName: "Bank of America",
    reason: "Bank account closed or invalid",
    resolution: "Update your bank account information in Payout Settings",
    canRetry: false 
  },
  { 
    id: "PAY-F003", 
    amount: 1250.00, 
    date: "Jun 20, 2025", 
    bankAccount: "****4523",
    bankName: "Chase",
    reason: "Bank rejected the transfer",
    resolution: "Contact your bank to verify the account can receive transfers",
    canRetry: true 
  },
];

export default function FailedPayouts() {
  const toast = useToast();
  const [showRetryModal, setShowRetryModal] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<typeof failedPayouts[0] | null>(null);
  const [retrying, setRetrying] = useState(false);

  const totalFailed = failedPayouts.reduce((sum, p) => sum + p.amount, 0);

  const handleRetry = (payout: typeof failedPayouts[0]) => {
    setSelectedPayout(payout);
    setShowRetryModal(true);
  };

  const confirmRetry = () => {
    setRetrying(true);
    setTimeout(() => {
      toast.success(`Payout ${selectedPayout?.id} retry initiated. You'll receive confirmation shortly.`);
      setRetrying(false);
      setShowRetryModal(false);
    }, 1500);
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/financials/payouts" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Failed Payouts</h1>
            <p className="text-gray-500">Review and resolve failed payout attempts</p>
          </div>
        </div>
        <Link to="/venue/financials/settings">
          <Button variant="secondary">
            <CreditCard className="w-4 h-4" />
            Update Bank Account
          </Button>
        </Link>
      </div>

      {/* Alert Banner */}
      {failedPayouts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">
                {failedPayouts.length} payout{failedPayouts.length !== 1 ? "s" : ""} failed totaling ${totalFailed.toLocaleString()}
              </p>
              <p className="text-sm text-red-700 mt-1">
                Review each failed payout below and take the recommended action to resolve the issue.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Failed Payouts List */}
      <div className="space-y-4">
        {failedPayouts.map((payout) => (
          <div key={payout.id} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="font-semibold text-gray-900">{payout.id}</span>
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700">
                    Failed
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-gray-500">Amount</p>
                    <p className="text-lg font-semibold text-gray-900">${payout.amount.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Date</p>
                    <p className="font-medium text-gray-900">{payout.date}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Bank Account</p>
                    <p className="font-medium text-gray-900">{payout.bankName} {payout.bankAccount}</p>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-start gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Failure Reason</p>
                      <p className="text-sm text-gray-600">{payout.reason}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 mt-3">
                    <HelpCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">How to Resolve</p>
                      <p className="text-sm text-gray-600">{payout.resolution}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="ml-6 flex flex-col gap-2">
                {payout.canRetry ? (
                  <Button onClick={() => handleRetry(payout)}>
                    <RefreshCw className="w-4 h-4" />
                    Retry Payout
                  </Button>
                ) : (
                  <Link to="/venue/financials/settings">
                    <Button>
                      <CreditCard className="w-4 h-4" />
                      Update Bank
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          </div>
        ))}

        {failedPayouts.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="w-8 h-8 text-green-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Failed Payouts</h3>
            <p className="text-gray-500">All your payouts have been processed successfully.</p>
          </div>
        )}
      </div>

      {/* Retry Confirmation Modal */}
      <Modal
        isOpen={showRetryModal}
        onClose={() => setShowRetryModal(false)}
        title="Retry Payout"
        size="sm"
      >
        <div className="space-y-4">
          <p className="text-gray-600">
            Are you sure you want to retry this payout?
          </p>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex justify-between items-center">
              <span className="text-gray-600">Amount</span>
              <span className="font-semibold text-gray-900">${selectedPayout?.amount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center mt-2">
              <span className="text-gray-600">Destination</span>
              <span className="font-medium text-gray-900">{selectedPayout?.bankName} {selectedPayout?.bankAccount}</span>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            The payout will be processed within 1-2 business days if successful.
          </p>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowRetryModal(false)}>Cancel</Button>
          <Button onClick={confirmRetry} disabled={retrying}>
            {retrying ? "Retrying..." : "Retry Payout"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

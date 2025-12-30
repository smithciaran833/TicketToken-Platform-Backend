import { useState } from "react";
import { Link } from "react-router-dom";
import { RefreshCw, DollarSign, TrendingUp, ShoppingCart, ChevronRight, BarChart3, Shield, AlertTriangle } from "lucide-react";
import { Button, Toggle, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

export default function ResaleSettings() {
  const toast = useToast();
  const [resaleEnabled, setResaleEnabled] = useState(true);
  const [showDisableModal, setShowDisableModal] = useState(false);

  const stats = {
    activeListings: 47,
    totalVolume: 12450,
    royaltiesEarned: 1867,
  };

  const handleToggle = (enabled: boolean) => {
    if (!enabled) {
      setShowDisableModal(true);
    } else {
      setResaleEnabled(true);
      toast.success("Resale marketplace enabled");
    }
  };

  const confirmDisable = () => {
    setResaleEnabled(false);
    setShowDisableModal(false);
    toast.success("Resale marketplace disabled");
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Resale Settings</h1>
          <p className="text-gray-500">Manage your secondary ticket marketplace</p>
        </div>
        <Link to="/venue/resale/marketplace">
          <Button variant="secondary">
            <ShoppingCart className="w-4 h-4" />
            View Marketplace
          </Button>
        </Link>
      </div>

      {/* Resale Status */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${resaleEnabled ? "bg-green-100" : "bg-gray-100"}`}>
              <RefreshCw className={`w-6 h-6 ${resaleEnabled ? "text-green-600" : "text-gray-400"}`} />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Resale Marketplace</h2>
              <p className="text-sm text-gray-500">
                {resaleEnabled ? "Ticket holders can resell tickets on your marketplace" : "Resale is currently disabled"}
              </p>
            </div>
          </div>
          <Toggle
            enabled={resaleEnabled}
            onChange={handleToggle}
          />
        </div>
      </div>

      {/* Quick Stats */}
      {resaleEnabled && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Listings</p>
                <p className="text-3xl font-bold text-gray-900">{stats.activeListings}</p>
              </div>
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-purple-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Resale Volume</p>
                <p className="text-3xl font-bold text-gray-900">${stats.totalVolume.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Royalties Earned</p>
                <p className="text-3xl font-bold text-green-600">${stats.royaltiesEarned.toLocaleString()}</p>
              </div>
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-600" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Settings Sections */}
      <div className="grid grid-cols-2 gap-6 mb-6">
        <Link to="/venue/resale/pricing" className="bg-white rounded-lg border border-gray-200 p-6 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <DollarSign className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Price Rules</h3>
                <p className="text-sm text-gray-500">Set min/max prices for resale</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        <Link to="/venue/resale/royalties" className="bg-white rounded-lg border border-gray-200 p-6 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Royalty Settings</h3>
                <p className="text-sm text-gray-500">Configure venue & artist royalties</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        <Link to="/venue/resale/policies" className="bg-white rounded-lg border border-gray-200 p-6 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Resale Policies</h3>
                <p className="text-sm text-gray-500">Buyer protections & seller rules</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>

        <Link to="/venue/resale/analytics" className="bg-white rounded-lg border border-gray-200 p-6 hover:border-purple-300 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                <BarChart3 className="w-6 h-6 text-yellow-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-900">Resale Analytics</h3>
                <p className="text-sm text-gray-500">Volume, trends, and insights</p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </Link>
      </div>

      {/* Blockchain Info */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <RefreshCw className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-purple-800">Powered by Blockchain</p>
            <p className="text-sm text-purple-700">
              All resale transactions are recorded on-chain, ensuring authenticity and automatic royalty distribution. 
              Buyers are guaranteed authentic tickets, and you earn royalties on every resale.
            </p>
          </div>
        </div>
      </div>

      {/* Disable Modal */}
      <Modal
        isOpen={showDisableModal}
        onClose={() => setShowDisableModal(false)}
        title="Disable Resale Marketplace"
      >
        <div className="space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800">Warning: Active Listings</p>
                <p className="text-sm text-yellow-700">
                  You have {stats.activeListings} active listings. Disabling resale will remove all current listings from the marketplace.
                </p>
              </div>
            </div>
          </div>
          <p className="text-gray-600">
            Are you sure you want to disable the resale marketplace? Ticket holders will no longer be able to resell their tickets.
          </p>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDisableModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDisable}>Disable Resale</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

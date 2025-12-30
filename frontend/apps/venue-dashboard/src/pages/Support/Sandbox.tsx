import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Play, RefreshCw, AlertTriangle, Check, Beaker } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

export default function Sandbox() {
  const toast = useToast();
  const [sandboxActive, setSandboxActive] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleActivate = () => {
    setLoading(true);
    setTimeout(() => {
      setSandboxActive(true);
      setLoading(false);
      toast.success("Sandbox mode activated!");
    }, 1500);
  };

  const handleDeactivate = () => {
    setSandboxActive(false);
    toast.success("Sandbox mode deactivated");
  };

  const handleReset = () => {
    toast.success("Sandbox data reset to defaults");
  };

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sandbox Mode</h1>
          <p className="text-gray-500">Test features without affecting real data</p>
        </div>
      </div>

      {/* Status Banner */}
      {sandboxActive ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-3">
            <Beaker className="w-6 h-6 text-yellow-600" />
            <div className="flex-1">
              <p className="font-semibold text-yellow-800">Sandbox Mode Active</p>
              <p className="text-sm text-yellow-700">Changes you make won't affect your real venue data</p>
            </div>
            <Button variant="secondary" size="sm" onClick={handleDeactivate}>
              Exit Sandbox
            </Button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center mb-6">
          <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Beaker className="w-8 h-8 text-purple-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Try Sandbox Mode</h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Experiment with all features using sample data. Perfect for training new team members or testing workflows.
          </p>
          <Button onClick={handleActivate} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Activating...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Activate Sandbox
              </>
            )}
          </Button>
        </div>
      )}

      {/* Features */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">What You Can Test</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            "Create and edit events",
            "Set up ticket types and pricing",
            "Process test transactions",
            "Use the scanner with test tickets",
            "Generate sample analytics",
            "Try all settings and configurations",
          ].map((feature, index) => (
            <div key={index} className="flex items-center gap-2 text-gray-700">
              <Check className="w-4 h-4 text-green-500" />
              {feature}
            </div>
          ))}
        </div>
      </div>

      {/* Sample Data */}
      {sandboxActive && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Sample Data</h2>
            <Button variant="secondary" size="sm" onClick={handleReset}>
              <RefreshCw className="w-4 h-4" />
              Reset Data
            </Button>
          </div>
          <div className="grid grid-cols-4 gap-4 text-center">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">5</p>
              <p className="text-sm text-gray-500">Sample Events</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">12</p>
              <p className="text-sm text-gray-500">Ticket Types</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">250</p>
              <p className="text-sm text-gray-500">Test Orders</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-2xl font-bold text-gray-900">3</p>
              <p className="text-sm text-gray-500">Team Members</p>
            </div>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-700 mb-1">Important Notes</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Sandbox data is completely separate from your real venue</li>
              <li>No real payments or emails will be processed</li>
              <li>Sandbox data resets after 24 hours of inactivity</li>
              <li>You can exit sandbox mode at any time</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

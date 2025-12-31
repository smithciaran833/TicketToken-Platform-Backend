import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Shield, Smartphone, Key, ChevronRight } from "lucide-react";

export default function Enable2FA() {
  const navigate = useNavigate();
  const [is2FAEnabled, setIs2FAEnabled] = useState(false);
  const [method, setMethod] = useState<"sms" | "authenticator" | null>("sms");

  const handleDisable = async () => {
    if (confirm("Are you sure you want to disable two-factor authentication?")) {
      setIs2FAEnabled(false);
      setMethod(null);
    }
  };

  if (!is2FAEnabled) {
    return (
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Two-Factor Authentication</h1>
          </div>
        </header>

        <div className="px-5 py-6 space-y-6">
          {/* Status */}
          <div className="bg-amber-50 rounded-xl p-4 flex items-center gap-3">
            <Shield className="w-6 h-6 text-amber-600" />
            <div>
              <p className="font-semibold text-amber-800">2FA is disabled</p>
              <p className="text-sm text-amber-700">Add an extra layer of security</p>
            </div>
          </div>

          {/* Explanation */}
          <div>
            <h2 className="font-semibold text-gray-900 mb-2">What is 2FA?</h2>
            <p className="text-gray-600">
              Two-factor authentication adds an extra layer of security to your account.
              In addition to your password, you'll need to enter a code from your phone
              when logging in.
            </p>
          </div>

          {/* Enable Button */}
          <Link
            to="/profile/settings/2fa/setup"
            className="block w-full py-3.5 bg-purple-600 text-white text-center font-semibold rounded-xl hover:bg-purple-700 transition-colors"
          >
            Enable 2FA
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Two-Factor Authentication</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Status */}
        <div className="bg-green-50 rounded-xl p-4 flex items-center gap-3">
          <Shield className="w-6 h-6 text-green-600" />
          <div>
            <p className="font-semibold text-green-800">2FA is enabled</p>
            <p className="text-sm text-green-700">Your account is protected</p>
          </div>
        </div>

        {/* Current Method */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
              Current Method
            </p>
          </div>
          <div className="flex items-center gap-4 px-5 py-4">
            {method === "sms" ? (
              <>
                <Smartphone className="w-6 h-6 text-purple-600" />
                <div>
                  <p className="font-medium text-gray-900">SMS</p>
                  <p className="text-sm text-gray-500">Codes sent to •••• 4567</p>
                </div>
              </>
            ) : (
              <>
                <Key className="w-6 h-6 text-purple-600" />
                <div>
                  <p className="font-medium text-gray-900">Authenticator App</p>
                  <p className="text-sm text-gray-500">Google Authenticator</p>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Backup Codes */}
        <Link
          to="/profile/settings/2fa/backup-codes"
          className="flex items-center justify-between bg-white rounded-xl shadow-sm px-5 py-4"
        >
          <div className="flex items-center gap-4">
            <Key className="w-5 h-5 text-gray-400" />
            <span className="font-medium text-gray-900">View Backup Codes</span>
          </div>
          <ChevronRight className="w-5 h-5 text-gray-300" />
        </Link>

        {/* Disable Button */}
        <button
          onClick={handleDisable}
          className="w-full py-3.5 bg-white text-red-600 font-semibold rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
        >
          Disable 2FA
        </button>
      </div>
    </div>
  );
}

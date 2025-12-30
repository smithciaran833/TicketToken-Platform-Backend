import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Smartphone, Shield, Key, Copy, Check } from "lucide-react";
import { Button, Input, useToast, ToastContainer } from "../../components/ui";

export default function TwoFactorSetup() {
  const toast = useToast();
  const [method, setMethod] = useState<"authenticator" | "sms" | null>(null);
  const [step, setStep] = useState(1);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const secretKey = "JBSWY3DPEHPK3PXP";
  const backupCodes = ["ABC123", "DEF456", "GHI789", "JKL012", "MNO345", "PQR678", "STU901", "VWX234"];

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secretKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = () => {
    if (code.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }
    setStep(3);
    toast.success("Two-factor authentication enabled!");
  };

  const handleDisable = () => {
    toast.success("Two-factor authentication disabled");
    setMethod(null);
    setStep(1);
    setCode("");
  };

  return (
    <div className="max-w-xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/team" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Two-Factor Authentication</h1>
          <p className="text-gray-500">Add an extra layer of security</p>
        </div>
      </div>

      {/* Method Selection */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Protect Your Account</h2>
                <p className="text-sm text-gray-500">Choose a verification method</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => { setMethod("authenticator"); setStep(2); }}
                className={`w-full p-4 rounded-lg border text-left transition-colors ${
                  method === "authenticator" ? "border-purple-500 bg-purple-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Smartphone className="w-6 h-6 text-purple-600" />
                  <div>
                    <p className="font-medium text-gray-900">Authenticator App</p>
                    <p className="text-sm text-gray-500">Use Google Authenticator, Authy, or similar</p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => { setMethod("sms"); setStep(2); }}
                className={`w-full p-4 rounded-lg border text-left transition-colors ${
                  method === "sms" ? "border-purple-500 bg-purple-50" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Key className="w-6 h-6 text-blue-600" />
                  <div>
                    <p className="font-medium text-gray-900">SMS Verification</p>
                    <p className="text-sm text-gray-500">Receive codes via text message</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Setup Step */}
      {step === 2 && method === "authenticator" && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">1. Scan QR Code</h2>
            <div className="flex justify-center mb-4">
              <div className="w-48 h-48 bg-gray-100 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300">
                <span className="text-gray-400 text-sm">QR Code</span>
              </div>
            </div>
            <p className="text-sm text-gray-600 text-center mb-4">
              Scan this code with your authenticator app
            </p>
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              <code className="flex-1 text-sm font-mono text-gray-700">{secretKey}</code>
              <button onClick={handleCopySecret} className="text-gray-400 hover:text-gray-600">
                {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">2. Enter Verification Code</h2>
            <Input
              label="6-digit code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="text-center text-2xl tracking-widest"
            />
            <Button onClick={handleVerify} className="w-full mt-4">
              Verify & Enable
            </Button>
          </div>

          <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">
            ← Choose different method
          </button>
        </div>
      )}

      {step === 2 && method === "sms" && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Verify Phone Number</h2>
            <Input
              label="Phone Number"
              placeholder="+1 (555) 000-0000"
              value=""
              onChange={() => {}}
            />
            <Button className="w-full mt-4">Send Code</Button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Enter Code</h2>
            <Input
              label="6-digit code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            />
            <Button onClick={handleVerify} className="w-full mt-4">
              Verify & Enable
            </Button>
          </div>

          <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700">
            ← Choose different method
          </button>
        </div>
      )}

      {/* Success / Enabled State */}
      {step === 3 && (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <Shield className="w-6 h-6 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-green-800">2FA Enabled</h2>
            <p className="text-sm text-green-700 mt-1">Your account is now protected</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Backup Codes</h2>
            <p className="text-sm text-gray-600 mb-4">
              Save these codes in a safe place. You can use them to access your account if you lose your phone.
            </p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {backupCodes.map((backupCode, i) => (
                <code key={i} className="px-2 py-1 bg-gray-100 rounded text-sm text-center font-mono">
                  {backupCode}
                </code>
              ))}
            </div>
            <Button variant="secondary" className="w-full">
              <Copy className="w-4 h-4" />
              Copy All Codes
            </Button>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-2">Disable 2FA</h2>
            <p className="text-sm text-gray-600 mb-4">
              This will remove the extra security from your account.
            </p>
            <Button variant="secondary" onClick={handleDisable} className="text-red-600 border-red-200 hover:bg-red-50">
              Disable Two-Factor Authentication
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

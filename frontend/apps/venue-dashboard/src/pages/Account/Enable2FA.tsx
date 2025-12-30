import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield, Smartphone, Copy, Check } from "lucide-react";
import { Button, Input, useToast, ToastContainer } from "../../components/ui";

export default function Enable2FA() {
  const toast = useToast();
  const [step, setStep] = useState<"choose" | "setup" | "verify" | "complete">("choose");
  const [method, setMethod] = useState<"app" | "sms" | null>(null);
  const [verifyCode, setVerifyCode] = useState("");
  const [copied, setCopied] = useState(false);

  const secretKey = "JBSW Y3DP EHPK 3PXP";
  const backupCodes = ["A1B2-C3D4", "E5F6-G7H8", "I9J0-K1L2", "M3N4-O5P6", "Q7R8-S9T0", "U1V2-W3X4", "Y5Z6-A7B8", "C9D0-E1F2"];

  const handleCopySecret = () => {
    navigator.clipboard.writeText(secretKey.replace(/\s/g, ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleVerify = () => {
    if (verifyCode.length !== 6) {
      toast.error("Please enter a 6-digit code");
      return;
    }
    setStep("complete");
    toast.success("Two-factor authentication enabled!");
  };

  return (
    <div className="max-w-xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center gap-4 mb-6">
        <Link to="/account/settings" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Two-Factor Authentication</h1>
          <p className="text-gray-500">Add an extra layer of security</p>
        </div>
      </div>

      {step === "choose" && (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                <Shield className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="font-semibold text-gray-900">Secure Your Account</h2>
                <p className="text-sm text-gray-500">Choose a verification method</p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => { setMethod("app"); setStep("setup"); }}
                className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors text-left"
              >
                <Smartphone className="w-6 h-6 text-gray-600" />
                <div>
                  <p className="font-medium text-gray-900">Authenticator App</p>
                  <p className="text-sm text-gray-500">Use Google Authenticator, Authy, or similar</p>
                </div>
              </button>

              <button
                onClick={() => { setMethod("sms"); setStep("setup"); }}
                className="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors text-left"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
                <div>
                  <p className="font-medium text-gray-900">SMS Verification</p>
                  <p className="text-sm text-gray-500">Receive codes via text message</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {step === "setup" && method === "app" && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-gray-900 mb-2">Step 1: Scan QR Code</h2>
            <p className="text-sm text-gray-500 mb-4">Scan this QR code with your authenticator app</p>
            <div className="w-48 h-48 bg-gray-100 rounded-lg mx-auto flex items-center justify-center">
              <span className="text-gray-400">[QR Code]</span>
            </div>
          </div>

          <div>
            <p className="text-sm text-gray-500 mb-2">Or enter this code manually:</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-4 py-2 bg-gray-100 rounded-lg font-mono text-sm">
                {secretKey}
              </code>
              <button
                onClick={handleCopySecret}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">Step 2: Enter Verification Code</h2>
            <Input
              label="6-digit code from your app"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleVerify}>Verify & Enable</Button>
            <Button variant="secondary" onClick={() => setStep("choose")}>Back</Button>
          </div>
        </div>
      )}

      {step === "setup" && method === "sms" && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
          <div>
            <h2 className="font-semibold text-gray-900 mb-2">Enter Your Phone Number</h2>
            <Input
              label="Phone Number"
              type="tel"
              placeholder="+1 (555) 123-4567"
            />
            <Button className="mt-4">Send Code</Button>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">Enter Verification Code</h2>
            <Input
              label="6-digit code from SMS"
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
            />
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleVerify}>Verify & Enable</Button>
            <Button variant="secondary" onClick={() => setStep("choose")}>Back</Button>
          </div>
        </div>
      )}

      {step === "complete" && (
        <div className="space-y-6">
          <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-green-800 mb-2">2FA Enabled!</h2>
            <p className="text-green-700">Your account is now more secure</p>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Backup Codes</h3>
            <p className="text-sm text-gray-500 mb-4">
              Save these codes somewhere safe. You can use them to access your account if you lose your phone.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {backupCodes.map((code, index) => (
                <code key={index} className="px-3 py-2 bg-gray-100 rounded text-center font-mono text-sm">
                  {code}
                </code>
              ))}
            </div>
            <Button variant="secondary" className="w-full">
              <Copy className="w-4 h-4" />
              Copy All Codes
            </Button>
          </div>

          <Link to="/account/settings">
            <Button className="w-full">Done</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

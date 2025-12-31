import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Smartphone, Key, Check } from "lucide-react";

export default function TwoFactorSetup() {
  const navigate = useNavigate();
  const [method, setMethod] = useState<"sms" | "authenticator">("sms");
  const [step, setStep] = useState<"select" | "verify" | "backup">("select");
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);

  const mockBackupCodes = [
    "ABCD-1234-EFGH",
    "IJKL-5678-MNOP",
    "QRST-9012-UVWX",
    "YZAB-3456-CDEF",
    "GHIJ-7890-KLMN",
  ];

  const handleVerify = async () => {
    setIsVerifying(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));
    setIsVerifying(false);
    setStep("backup");
  };

  const handleComplete = () => {
    navigate("/profile/settings/2fa", { state: { enabled: true } });
  };

  if (step === "backup") {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Backup Codes</h1>
          </div>
        </header>

        <div className="px-5 py-6 space-y-6">
          <div className="flex items-center gap-3 p-4 bg-green-50 rounded-xl">
            <Check className="w-6 h-6 text-green-600" />
            <p className="font-medium text-green-800">2FA enabled successfully!</p>
          </div>

          <div>
            <h2 className="font-semibold text-gray-900 mb-2">Save Your Backup Codes</h2>
            <p className="text-gray-600 text-sm">
              Use these codes to access your account if you lose your phone.
              Each code can only be used once.
            </p>
          </div>

          <div className="bg-gray-50 rounded-xl p-4 space-y-2">
            {mockBackupCodes.map((code, index) => (
              <p key={index} className="font-mono text-center text-gray-900">
                {code}
              </p>
            ))}
          </div>

          <button className="w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors">
            Download Codes
          </button>

          <button
            onClick={handleComplete}
            className="w-full py-3.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    );
  }

  if (step === "verify") {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setStep("select")} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Verify Code</h1>
          </div>
        </header>

        <div className="px-5 py-6 space-y-6">
          {method === "sms" ? (
            <p className="text-gray-600">
              Enter the 6-digit code sent to your phone number ending in •••• 4567
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-gray-600">
                Scan this QR code with your authenticator app, then enter the code below.
              </p>
              <div className="w-48 h-48 bg-gray-100 rounded-xl mx-auto flex items-center justify-center">
                <span className="text-gray-400">[QR Code]</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification Code
            </label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              placeholder="000000"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-center text-2xl font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-purple-500"
              maxLength={6}
            />
          </div>

          <button
            onClick={handleVerify}
            disabled={code.length !== 6 || isVerifying}
            className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
              code.length === 6 && !isVerifying
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isVerifying ? "Verifying..." : "Verify"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Set Up 2FA</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        <p className="text-gray-600">Choose how you want to receive verification codes:</p>

        <div className="space-y-3">
          <button
            onClick={() => setMethod("sms")}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors ${
              method === "sms"
                ? "border-purple-600 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <Smartphone className={`w-6 h-6 ${method === "sms" ? "text-purple-600" : "text-gray-400"}`} />
            <div className="text-left">
              <p className="font-semibold text-gray-900">SMS</p>
              <p className="text-sm text-gray-500">Receive codes via text message</p>
            </div>
          </button>

          <button
            onClick={() => setMethod("authenticator")}
            className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-colors ${
              method === "authenticator"
                ? "border-purple-600 bg-purple-50"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <Key className={`w-6 h-6 ${method === "authenticator" ? "text-purple-600" : "text-gray-400"}`} />
            <div className="text-left">
              <p className="font-semibold text-gray-900">Authenticator App</p>
              <p className="text-sm text-gray-500">Use Google Authenticator or similar</p>
            </div>
          </button>
        </div>

        <button
          onClick={() => setStep("verify")}
          className="w-full py-3.5 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}

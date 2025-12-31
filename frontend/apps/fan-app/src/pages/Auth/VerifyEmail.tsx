import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Mail, RefreshCw } from "lucide-react";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const location = useLocation();
  const email = (location.state as { email?: string })?.email || "your email";

  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  const handleCodeChange = (index: number, value: string) => {
    if (value.length > 1) return;

    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);
    setError("");

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`code-${index + 1}`);
      nextInput?.focus();
    }

    // Auto-submit when complete
    if (newCode.every((c) => c) && newCode.join("").length === 6) {
      verifyCode(newCode.join(""));
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) {
      const prevInput = document.getElementById(`code-${index - 1}`);
      prevInput?.focus();
    }
  };

  const verifyCode = async (fullCode: string) => {
    setIsVerifying(true);
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock verification - "123456" is valid
    if (fullCode === "123456") {
      navigate("/");
    } else {
      setError("Invalid verification code");
      setCode(["", "", "", "", "", ""]);
      document.getElementById("code-0")?.focus();
    }
    setIsVerifying(false);
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;

    setResendCooldown(30);
    // Would trigger API call to resend code
  };

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center px-5 py-12">
      {/* Icon */}
      <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mb-6">
        <Mail className="w-10 h-10 text-purple-600" />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Verify your email</h1>
      <p className="text-gray-500 text-center max-w-xs mb-8">
        We've sent a 6-digit code to <strong>{email}</strong>
      </p>

      {/* Code Input */}
      <div className="flex gap-2 mb-6">
        {code.map((digit, index) => (
          <input
            key={index}
            id={`code-${index}`}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleCodeChange(index, e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => handleKeyDown(index, e)}
            className={`w-12 h-14 text-center text-2xl font-bold bg-gray-50 border rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
              error ? "border-red-300" : "border-gray-200"
            }`}
            disabled={isVerifying}
          />
        ))}
      </div>

      {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

      {isVerifying && (
        <p className="text-purple-600 font-medium mb-4">Verifying...</p>
      )}

      {/* Resend */}
      <button
        onClick={handleResend}
        disabled={resendCooldown > 0}
        className="flex items-center gap-2 text-purple-600 font-medium hover:text-purple-700 disabled:text-gray-400"
      >
        <RefreshCw className={`w-4 h-4 ${resendCooldown > 0 ? "" : "hover:rotate-180 transition-transform"}`} />
        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend code"}
      </button>

      {/* Change Email */}
      <button
        onClick={() => navigate("/auth/signup")}
        className="mt-6 text-gray-500 text-sm hover:text-gray-700"
      >
        Use a different email
      </button>
    </div>
  );
}

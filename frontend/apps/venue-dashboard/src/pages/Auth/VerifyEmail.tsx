import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Ticket, CheckCircle, XCircle, RefreshCw } from "lucide-react";

type VerificationState = "verifying" | "success" | "error" | "expired";

export default function VerifyEmail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState<VerificationState>("verifying");
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    // Mock verification
    const timer = setTimeout(() => {
      if (token && token.length > 10) {
        setState("success");
      } else if (token === "expired") {
        setState("expired");
      } else {
        setState("error");
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, [token]);

  const handleResend = () => {
    setIsResending(true);
    setTimeout(() => {
      setIsResending(false);
      // Show success message or handle error
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4">
            <Ticket className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">TicketToken</h1>
          <p className="text-gray-400 mt-1">Venue Dashboard</p>
        </div>

        {/* Card */}
        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
          {state === "verifying" && (
            <div className="text-center py-8">
              <svg className="animate-spin w-12 h-12 text-indigo-500 mx-auto mb-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              <h2 className="text-xl font-semibold text-white mb-2">Verifying your email...</h2>
              <p className="text-gray-400 text-sm">Please wait while we verify your email address.</p>
            </div>
          )}

          {state === "success" && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Email Verified!</h2>
              <p className="text-gray-400 text-sm mb-6">
                Your email has been successfully verified. You can now access all features of your account.
              </p>
              <button
                onClick={() => navigate("/venue")}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
              >
                Continue to Dashboard
              </button>
            </div>
          )}

          {state === "error" && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-500/20 rounded-full mb-4">
                <XCircle className="w-8 h-8 text-red-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Verification Failed</h2>
              <p className="text-gray-400 text-sm mb-6">
                This verification link is invalid. Please check the link or request a new verification email.
              </p>
              <button
                onClick={handleResend}
                disabled={isResending}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mb-3"
              >
                {isResending ? (
                  <>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Resend Verification Email
                  </>
                )}
              </button>
              <Link
                to="/login"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Back to login
              </Link>
            </div>
          )}

          {state === "expired" && (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-500/20 rounded-full mb-4">
                <XCircle className="w-8 h-8 text-yellow-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Link Expired</h2>
              <p className="text-gray-400 text-sm mb-6">
                This verification link has expired. Please request a new verification email.
              </p>
              <button
                onClick={handleResend}
                disabled={isResending}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-600/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 mb-3"
              >
                {isResending ? (
                  <>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Sending...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-5 h-5" />
                    Resend Verification Email
                  </>
                )}
              </button>
              <Link
                to="/login"
                className="text-sm text-gray-400 hover:text-white transition-colors"
              >
                Back to login
              </Link>
            </div>
          )}
        </div>

        <p className="mt-8 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} TicketToken. All rights reserved.
        </p>
      </div>
    </div>
  );
}

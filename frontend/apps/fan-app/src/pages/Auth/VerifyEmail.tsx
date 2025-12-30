import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui";

export default function VerifyEmail() {
  const navigate = useNavigate();
  const [resent, setResent] = useState(false);
  const email = "user@example.com"; // Would come from auth state

  const handleResend = () => {
    setResent(true);
    setTimeout(() => setResent(false), 3000);
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="px-4 py-3 flex items-center">
        <button onClick={() => navigate("/signup")} className="text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </header>

      <div className="px-6 pt-12 text-center">
        <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Mail className="w-10 h-10 text-purple-600" />
        </div>

        <h1 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h1>
        <p className="text-gray-500 mb-2">We sent a verification link to</p>
        <p className="text-gray-900 font-medium mb-8">{email}</p>

        <Button variant="secondary" className="mb-4" onClick={handleResend}>
          {resent ? "Email Sent!" : "Resend Email"}
        </Button>

        <button 
          onClick={() => navigate("/signup")}
          className="text-sm text-purple-600 hover:text-purple-700"
        >
          Change Email Address
        </button>

        {/* For demo purposes - skip verification */}
        <div className="mt-12 pt-8 border-t border-gray-200">
          <p className="text-sm text-gray-400 mb-3">Demo Mode</p>
          <Button onClick={() => navigate("/")} variant="secondary">
            Skip to App →
          </Button>
        </div>
      </div>
    </div>
  );
}

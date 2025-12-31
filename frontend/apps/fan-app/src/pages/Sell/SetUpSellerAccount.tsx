import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Shield, Clock} from "lucide-react";

const benefits = [
  {
    icon: CreditCard,
    title: "Get paid fast",
    description: "Receive payouts within 3-5 business days of a sale",
  },
  {
    icon: Shield,
    title: "Secure payments",
    description: "Bank-level security powered by Stripe",
  },
  {
    icon: Clock,
    title: "Automatic transfers",
    description: "Money is automatically deposited to your bank",
  },
];

export default function SetUpSellerAccount() {
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnectStripe = async () => {
    setIsConnecting(true);
    // In real implementation, this would redirect to Stripe Connect
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // Simulate successful connection
    navigate("/sell/settings", { state: { stripeConnected: true } });
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Set Up Payouts</h1>
        </div>
      </header>

      <div className="px-5 py-8">
        {/* Hero */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CreditCard className="w-10 h-10 text-purple-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Connect Your Bank Account
          </h2>
          <p className="text-gray-500 max-w-xs mx-auto">
            Link your bank account to receive payouts when your tickets sell
          </p>
        </div>

        {/* Benefits */}
        <div className="space-y-4 mb-8">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <div
                key={benefit.title}
                className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl"
              >
                <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900">{benefit.title}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{benefit.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Stripe Info */}
        <div className="flex items-center justify-center gap-2 text-sm text-gray-500 mb-8">
          <Shield className="w-4 h-4" />
          <span>Secured by Stripe</span>
        </div>

        {/* Connect Button */}
        <button
          onClick={handleConnectStripe}
          disabled={isConnecting}
          className="w-full py-4 bg-purple-600 text-white font-semibold text-lg rounded-xl hover:bg-purple-700 active:scale-[0.98] transition-all disabled:bg-purple-400"
        >
          {isConnecting ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Connecting...
            </span>
          ) : (
            "Connect Bank Account"
          )}
        </button>

        <p className="text-xs text-gray-400 text-center mt-4">
          By connecting, you agree to Stripe's{" "}
          <a href="#" className="underline">
            Terms of Service
          </a>
        </p>
      </div>
    </div>
  );
}

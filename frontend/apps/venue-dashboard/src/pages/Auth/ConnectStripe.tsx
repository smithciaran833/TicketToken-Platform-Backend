import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ticket, CreditCard, CheckCircle, Shield, Zap, ArrowRight, ExternalLink } from "lucide-react";

export default function ConnectStripe() {
  const navigate = useNavigate();
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  const benefits = [
    {
      icon: <Zap className="w-5 h-5" />,
      title: "Fast Payouts",
      description: "Receive funds directly to your bank account within 2 business days"
    },
    {
      icon: <Shield className="w-5 h-5" />,
      title: "Secure Payments",
      description: "PCI-compliant payment processing with fraud protection"
    },
    {
      icon: <CreditCard className="w-5 h-5" />,
      title: "Multiple Payment Methods",
      description: "Accept credit cards, debit cards, and digital wallets"
    }
  ];

  const handleConnectStripe = () => {
    setIsConnecting(true);
    // Mock Stripe Connect OAuth flow
    setTimeout(() => {
      setIsConnecting(false);
      setIsConnected(true);
    }, 2000);
  };

  const handleContinue = () => {
    navigate("/venue/events/new");
  };

  const handleSkip = () => {
    navigate("/venue");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-600 rounded-2xl mb-4">
            <Ticket className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-white" />
          </div>
          <div className="w-12 h-1 bg-green-500 rounded" />
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-white" />
          </div>
          <div className="w-12 h-1 bg-indigo-500 rounded" />
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isConnected ? "bg-green-500" : "bg-indigo-500"
          }`}>
            {isConnected ? (
              <CheckCircle className="w-5 h-5 text-white" />
            ) : (
              <span className="text-white font-medium text-sm">3</span>
            )}
          </div>
          <div className="w-12 h-1 bg-gray-600 rounded" />
          <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
            <span className="text-gray-400 font-medium text-sm">4</span>
          </div>
        </div>

        {/* Card */}
        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
          {!isConnected ? (
            <>
              <div className="text-center mb-8">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-purple-500/20 rounded-2xl mb-4">
                  <CreditCard className="w-8 h-8 text-purple-400" />
                </div>
                <h1 className="text-2xl font-bold text-white mb-2">Connect Your Bank Account</h1>
                <p className="text-gray-400">
                  Set up payments to start receiving ticket sales revenue directly to your bank account.
                </p>
              </div>

              {/* Benefits */}
              <div className="space-y-4 mb-8">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                      {benefit.icon}
                    </div>
                    <div>
                      <h3 className="font-medium text-white">{benefit.title}</h3>
                      <p className="text-sm text-gray-400">{benefit.description}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Stripe Button */}
              <button
                onClick={handleConnectStripe}
                disabled={isConnecting}
                className="w-full py-3 px-4 bg-[#635BFF] hover:bg-[#5851ea] disabled:bg-[#635BFF]/50 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-3 mb-4"
              >
                {isConnecting ? (
                  <>
                    <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Connecting to Stripe...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" />
                    </svg>
                    Connect with Stripe
                    <ExternalLink className="w-4 h-4" />
                  </>
                )}
              </button>

              <button
                onClick={handleSkip}
                className="w-full py-3 px-4 text-gray-400 hover:text-white font-medium transition-colors"
              >
                Skip for now
              </button>

              <p className="mt-6 text-center text-xs text-gray-500">
                You'll be redirected to Stripe to securely connect your account.
                <br />
                We never see or store your banking information.
              </p>
            </>
          ) : (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-500/20 rounded-full mb-4">
                <CheckCircle className="w-8 h-8 text-green-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">Payment Account Connected!</h2>
              <p className="text-gray-400 text-sm mb-6">
                Your Stripe account has been successfully connected. You're ready to start accepting payments!
              </p>

              <div className="bg-gray-700/50 rounded-lg p-4 mb-6 text-left">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-400 text-sm">Account Status</span>
                  <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">Payout Schedule</span>
                  <span className="text-white text-sm">2 business days</span>
                </div>
              </div>

              <button
                onClick={handleContinue}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                Create Your First Event
                <ArrowRight className="w-5 h-5" />
              </button>
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

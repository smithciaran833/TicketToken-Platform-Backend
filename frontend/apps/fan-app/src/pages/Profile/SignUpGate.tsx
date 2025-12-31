import { Link } from "react-router-dom";
import { X, Ticket, Heart, Bell, Tag } from "lucide-react";

interface SignUpGateProps {
  isOpen: boolean;
  onClose: () => void;
  action?: string;
}

const benefits = [
  { icon: Ticket, text: "Access your tickets anywhere" },
  { icon: Heart, text: "Save events for later" },
  { icon: Bell, text: "Get notified about price drops" },
  { icon: Tag, text: "Sell tickets you can't use" },
];

export default function SignUpGate({ isOpen, onClose, action = "continue" }: SignUpGateProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-md sm:rounded-2xl rounded-t-3xl max-h-[90vh] overflow-hidden">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors z-10"
        >
          <X className="w-5 h-5 text-gray-600" />
        </button>

        <div className="px-6 py-8">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-8 h-8 text-purple-600" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Sign in to {action}</h2>
            <p className="text-gray-500 mt-2">
              Create a free account or sign in to access all features
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-3 mb-8">
            {benefits.map((benefit) => {
              const Icon = benefit.icon;
              return (
                <div key={benefit.text} className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Icon className="w-4 h-4 text-gray-600" />
                  </div>
                  <span className="text-gray-700">{benefit.text}</span>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Link
              to="/auth/signup"
              onClick={onClose}
              className="block w-full py-3.5 bg-purple-600 text-white text-center font-semibold rounded-xl hover:bg-purple-700 transition-colors"
            >
              Create Account
            </Link>
            <Link
              to="/auth/login"
              onClick={onClose}
              className="block w-full py-3.5 bg-gray-100 text-gray-900 text-center font-semibold rounded-xl hover:bg-gray-200 transition-colors"
            >
              Sign In
            </Link>
          </div>

          {/* Terms */}
          <p className="text-xs text-gray-400 text-center mt-6">
            By continuing, you agree to our{" "}
            <Link to="/profile/legal/terms" className="underline">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link to="/profile/legal/privacy" className="underline">
              Privacy Policy
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

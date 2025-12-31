import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Mail, User, Check } from "lucide-react";

const requirements = [
  { label: "At least 8 characters", test: (p: string) => p.length >= 8 },
  { label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { label: "One number", test: (p: string) => /[0-9]/.test(p) },
];

export default function SignUpPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const allRequirementsMet = requirements.every((r) => r.test(password));
  const isValid = name.trim() && email.includes("@") && allRequirementsMet && agreedToTerms;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;

    setError("");
    setIsLoading(true);

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Mock validation
    if (email === "taken@test.com") {
      setError("An account with this email already exists");
      setIsLoading(false);
      return;
    }

    navigate("/auth/verify-email", { state: { email } });
  };

  return (
    <div className="min-h-screen bg-white pb-8">
      {/* Header */}
      <header className="px-5 py-4">
        <button onClick={() => navigate(-1)} className="p-1 -ml-1">
          <ArrowLeft className="w-6 h-6 text-gray-900" />
        </button>
      </header>

      <div className="px-5 py-6">
        {/* Title */}
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create account</h1>
        <p className="text-gray-500 mb-8">Start discovering events near you</p>

        {/* Social Sign Up */}
        <div className="space-y-3 mb-6">
          <button className="w-full flex items-center justify-center gap-3 py-3 border border-gray-200 rounded-xl font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <span className="text-xl">G</span>
            Continue with Google
          </button>
          <button className="w-full flex items-center justify-center gap-3 py-3 bg-black text-white rounded-xl font-medium hover:bg-gray-900 transition-colors">
            <span className="text-xl"></span>
            Continue with Apple
          </button>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-sm text-gray-500">or</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Name
            </label>
            <div className="relative">
              <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-3 pr-12 bg-gray-50 border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Requirements */}
            <div className="mt-3 space-y-1">
              {requirements.map((req) => {
                const met = req.test(password);
                return (
                  <div
                    key={req.label}
                    className={`flex items-center gap-2 text-sm ${
                      met ? "text-green-600" : "text-gray-400"
                    }`}
                  >
                    <Check className={`w-4 h-4 ${met ? "opacity-100" : "opacity-30"}`} />
                    <span>{req.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Terms */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500 mt-0.5"
            />
            <span className="text-sm text-gray-600">
              I agree to the{" "}
              <Link to="/profile/legal/terms" className="text-purple-600 underline">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link to="/profile/legal/privacy" className="text-purple-600 underline">
                Privacy Policy
              </Link>
            </span>
          </label>

          {error && (
            <p className="text-red-500 text-sm">{error}</p>
          )}

          <button
            type="submit"
            disabled={!isValid || isLoading}
            className={`w-full py-3.5 rounded-xl font-semibold text-lg transition-all ${
              isValid && !isLoading
                ? "bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98]"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isLoading ? "Creating account..." : "Create Account"}
          </button>
        </form>

        {/* Sign In Link */}
        <p className="text-center text-gray-500 mt-6">
          Already have an account?{" "}
          <Link to="/auth/login" className="text-purple-600 font-medium hover:text-purple-700">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Eye, EyeOff, Check } from "lucide-react";
import { Button, Input } from "../../components/ui";

export default function Signup() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ 
    email: "", 
    password: "", 
    confirmPassword: "",
    agreeTerms: false 
  });
  const [loading, setLoading] = useState(false);

  const passwordRequirements = [
    { text: "At least 8 characters", met: form.password.length >= 8 },
    { text: "One uppercase letter", met: /[A-Z]/.test(form.password) },
    { text: "One number", met: /[0-9]/.test(form.password) },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      navigate("/verify-email");
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-white">
      <header className="px-4 py-3 flex items-center">
        <button onClick={() => navigate("/welcome")} className="text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </header>

      <div className="px-6 pt-4 pb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Create Account</h1>
        <p className="text-gray-500 mb-8">Join TicketToken today</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={form.email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
            required
          />

          <div className="relative">
            <Input
              label="Password"
              type={showPassword ? "text" : "password"}
              value={form.password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, password: e.target.value })}
              placeholder="••••••••"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-9 text-gray-400"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="space-y-1">
            {passwordRequirements.map((req, i) => (
              <div key={i} className={`flex items-center gap-2 text-sm ${req.met ? "text-green-600" : "text-gray-400"}`}>
                <Check className={`w-4 h-4 ${req.met ? "opacity-100" : "opacity-40"}`} />
                {req.text}
              </div>
            ))}
          </div>

          <Input
            label="Confirm Password"
            type="password"
            value={form.confirmPassword}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, confirmPassword: e.target.value })}
            placeholder="••••••••"
            required
          />

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.agreeTerms}
              onChange={(e) => setForm({ ...form, agreeTerms: e.target.checked })}
              className="mt-1 w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
            />
            <span className="text-sm text-gray-600">
              I agree to the{" "}
              <Link to="/terms" className="text-purple-600 hover:underline">Terms of Service</Link>
              {" "}and{" "}
              <Link to="/privacy" className="text-purple-600 hover:underline">Privacy Policy</Link>
            </span>
          </label>

          <Button 
            type="submit" 
            className="w-full" 
            disabled={loading || !form.agreeTerms}
          >
            {loading ? "Creating Account..." : "Sign Up"}
          </Button>
        </form>

        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or sign up with</span>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="secondary" className="w-full">Google</Button>
            <Button variant="secondary" className="w-full">Apple</Button>
          </div>
        </div>

        <p className="mt-8 text-center text-gray-500">
          Already have an account?{" "}
          <Link to="/login" className="text-purple-600 hover:text-purple-700 font-medium">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}

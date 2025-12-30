import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Mail } from "lucide-react";
import { Button, Input } from "../../components/ui";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1000);
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-white">
        <header className="px-4 py-3 flex items-center">
          <button onClick={() => navigate("/login")} className="text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </button>
        </header>

        <div className="px-6 pt-12 text-center">
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Mail className="w-10 h-10 text-green-600" />
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">Check Your Email</h1>
          <p className="text-gray-500 mb-8">
            We've sent password reset instructions to<br />
            <span className="text-gray-900 font-medium">{email}</span>
          </p>

          <Link to="/login">
            <Button variant="secondary">Back to Log In</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="px-4 py-3 flex items-center">
        <button onClick={() => navigate("/login")} className="text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </button>
      </header>

      <div className="px-6 pt-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Reset Password</h1>
        <p className="text-gray-500 mb-8">
          Enter your email and we'll send you instructions to reset your password
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
          />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send Reset Link"}
          </Button>
        </form>

        <p className="mt-8 text-center text-gray-500">
          Remember your password?{" "}
          <Link to="/login" className="text-purple-600 hover:text-purple-700 font-medium">
            Log In
          </Link>
        </p>
      </div>
    </div>
  );
}

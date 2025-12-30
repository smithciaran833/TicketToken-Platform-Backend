import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Star, Check, Users, Clock, Phone } from "lucide-react";
import { Button, Textarea, useToast, ToastContainer } from "../../components/ui";

const benefits = [
  { icon: Users, title: "Dedicated Support", description: "Personal point of contact who knows your business" },
  { icon: Clock, title: "Priority Response", description: "Faster response times on all support requests" },
  { icon: Phone, title: "Scheduled Check-ins", description: "Regular calls to review performance and strategy" },
  { icon: Star, title: "Early Access", description: "Be first to try new features and updates" },
];

const plans = [
  { name: "Growth", price: 99, eligible: false, requirement: "Requires 10+ events/year" },
  { name: "Pro", price: 249, eligible: true, requirement: "Your current plan" },
  { name: "Enterprise", price: "Custom", eligible: true, requirement: "Unlimited events" },
];

export default function RequestAccountManager() {
  const toast = useToast();
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    setSubmitted(true);
    toast.success("Request submitted!");
  };

  if (submitted) {
    return (
      <div className="max-w-xl mx-auto text-center py-12">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Check className="w-8 h-8 text-green-600" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Request Submitted!</h1>
        <p className="text-gray-600 mb-6">
          We'll review your request and get back to you within 1-2 business days to match you with an account manager.
        </p>
        <Link to="/venue/support">
          <Button>Back to Help Center</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Request Account Manager</h1>
          <p className="text-gray-500">Get dedicated support for your venue</p>
        </div>
      </div>

      {/* Benefits */}
      <div className="bg-gradient-to-br from-purple-600 to-purple-800 rounded-lg p-6 mb-6 text-white">
        <h2 className="text-lg font-semibold mb-4">Account Manager Benefits</h2>
        <div className="grid grid-cols-2 gap-4">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon;
            return (
              <div key={index} className="flex items-start gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Icon className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-medium">{benefit.title}</p>
                  <p className="text-sm text-purple-200">{benefit.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Eligibility */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="font-semibold text-gray-900 mb-4">Eligibility</h2>
        <div className="space-y-3">
          {plans.map((plan) => (
            <div 
              key={plan.name}
              className={`flex items-center justify-between p-4 rounded-lg ${
                plan.eligible ? "bg-green-50 border border-green-200" : "bg-gray-50"
              }`}
            >
              <div className="flex items-center gap-3">
                {plan.eligible ? (
                  <Check className="w-5 h-5 text-green-600" />
                ) : (
                  <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                )}
                <div>
                  <p className={`font-medium ${plan.eligible ? "text-green-800" : "text-gray-600"}`}>
                    {plan.name} Plan
                  </p>
                  <p className="text-sm text-gray-500">{plan.requirement}</p>
                </div>
              </div>
              <p className="font-semibold text-gray-900">
                {typeof plan.price === "number" ? `$${plan.price}/mo` : plan.price}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Request Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Request Details</h2>
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <p className="text-green-800">
            ✓ You're eligible for a dedicated account manager on your current plan!
          </p>
        </div>
        <Textarea
          label="Tell us about your needs (optional)"
          placeholder="What are your main goals? Any specific challenges we should know about?"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
        />
        <Button onClick={handleSubmit} className="w-full mt-4">
          Request Account Manager
        </Button>
      </div>
    </div>
  );
}

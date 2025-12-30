import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Ticket, Building2, CreditCard, Calendar, CheckCircle, ChevronRight, Sparkles } from "lucide-react";

interface Step {
  id: number;
  title: string;
  description: string;
  icon: React.ReactNode;
  completed: boolean;
  route: string;
}

export default function OnboardingWelcome() {
  const navigate = useNavigate();
  const [steps] = useState<Step[]>([
    {
      id: 1,
      title: "Create Account",
      description: "Set up your login credentials",
      icon: <CheckCircle className="w-6 h-6" />,
      completed: true,
      route: ""
    },
    {
      id: 2,
      title: "Set Up Venue Profile",
      description: "Add your venue details, photos, and information",
      icon: <Building2 className="w-6 h-6" />,
      completed: false,
      route: "/venue/settings/profile"
    },
    {
      id: 3,
      title: "Connect Payments",
      description: "Link your bank account to receive payouts",
      icon: <CreditCard className="w-6 h-6" />,
      completed: false,
      route: "/onboarding/payments"
    },
    {
      id: 4,
      title: "Create First Event",
      description: "List your first event and start selling tickets",
      icon: <Calendar className="w-6 h-6" />,
      completed: false,
      route: "/venue/events/new"
    }
  ]);

  const completedSteps = steps.filter(s => s.completed).length;
  const progress = (completedSteps / steps.length) * 100;

  const handleGetStarted = () => {
    // Find the first incomplete step
    const nextStep = steps.find(s => !s.completed);
    if (nextStep && nextStep.route) {
      navigate(nextStep.route);
    } else {
      navigate("/venue");
    }
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

        {/* Card */}
        <div className="bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-700">
          {/* Welcome Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 rounded-full text-indigo-400 text-sm mb-4">
              <Sparkles className="w-4 h-4" />
              Welcome to TicketToken
            </div>
            <h1 className="text-2xl font-bold text-white mb-2">Let's get you set up!</h1>
            <p className="text-gray-400">
              Complete these steps to start selling tickets for your venue.
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mb-8">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-gray-400">Setup progress</span>
              <span className="text-white font-medium">{completedSteps} of {steps.length}</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Steps */}
          <div className="space-y-3 mb-8">
            {steps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                  step.completed 
                    ? "bg-green-500/10 border border-green-500/30" 
                    : index === completedSteps
                    ? "bg-indigo-500/10 border border-indigo-500/30"
                    : "bg-gray-700/50 border border-gray-700"
                }`}
              >
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                  step.completed 
                    ? "bg-green-500/20 text-green-400" 
                    : index === completedSteps
                    ? "bg-indigo-500/20 text-indigo-400"
                    : "bg-gray-600 text-gray-400"
                }`}>
                  {step.completed ? <CheckCircle className="w-5 h-5" /> : step.icon}
                </div>
                <div className="flex-grow">
                  <h3 className={`font-medium ${step.completed ? "text-green-400" : "text-white"}`}>
                    {step.title}
                  </h3>
                  <p className="text-sm text-gray-400">{step.description}</p>
                </div>
                {step.completed ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : index === completedSteps ? (
                  <ChevronRight className="w-5 h-5 text-indigo-400" />
                ) : null}
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button
              onClick={handleGetStarted}
              className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Get Started
              <ChevronRight className="w-5 h-5" />
            </button>
            <button
              onClick={handleSkip}
              className="w-full py-3 px-4 text-gray-400 hover:text-white font-medium transition-colors"
            >
              Skip for now
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-gray-500">
            You can always complete these steps later from your dashboard.
          </p>
        </div>

        <p className="mt-8 text-center text-xs text-gray-500">
          © {new Date().getFullYear()} TicketToken. All rights reserved.
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, Play, ChevronRight, Building2, Calendar, Ticket, QrCode, DollarSign } from "lucide-react";
import { Button } from "../../components/ui";

const steps = [
  {
    id: 1,
    title: "Set up your venue",
    description: "Add your venue details, location, and branding",
    icon: Building2,
    href: "/venue/settings/profile",
    videoId: 1,
    completed: true,
  },
  {
    id: 2,
    title: "Configure settings",
    description: "Set up payment, policies, and team access",
    icon: DollarSign,
    href: "/venue/settings",
    videoId: 2,
    completed: true,
  },
  {
    id: 3,
    title: "Create your first event",
    description: "Add event details, dates, and description",
    icon: Calendar,
    href: "/venue/events/new",
    videoId: 3,
    completed: false,
  },
  {
    id: 4,
    title: "Set up tickets",
    description: "Create ticket types and set pricing",
    icon: Ticket,
    href: "/venue/tickets/new",
    videoId: 4,
    completed: false,
  },
  {
    id: 5,
    title: "Scan attendees",
    description: "Learn how to use the scanner for check-in",
    icon: QrCode,
    href: "/venue/scanning",
    videoId: 5,
    completed: false,
  },
];

export default function GettingStarted() {
  const [expandedStep, setExpandedStep] = useState<number | null>(3);

  const completedCount = steps.filter(s => s.completed).length;
  const progress = (completedCount / steps.length) * 100;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Getting Started</h1>
          <p className="text-gray-500">Complete these steps to get up and running</p>
        </div>
      </div>

      {/* Progress */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="font-medium text-gray-900">Your Progress</span>
          <span className="text-sm text-gray-500">{completedCount} of {steps.length} complete</span>
        </div>
        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
          <div 
            className="h-full bg-purple-600 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-4">
        {steps.map((step, index) => {
          const isExpanded = expandedStep === step.id;

          return (
            <div 
              key={step.id}
              className={`bg-white rounded-lg border transition-all ${
                step.completed ? "border-green-200" : "border-gray-200"
              }`}
            >
              <button
                onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                className="w-full flex items-center gap-4 p-4 text-left"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                  step.completed 
                    ? "bg-green-100 text-green-600"
                    : "bg-gray-100 text-gray-400"
                }`}>
                  {step.completed ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <span className="font-medium">{index + 1}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${step.completed ? "text-green-700" : "text-gray-900"}`}>
                    {step.title}
                  </p>
                  <p className="text-sm text-gray-500">{step.description}</p>
                </div>
                <ChevronRight className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <div className="pt-4 flex items-center gap-4">
                    {/* Video Preview */}
                    <button className="w-48 aspect-video bg-gradient-to-br from-purple-500 to-purple-700 rounded-lg flex items-center justify-center group flex-shrink-0">
                      <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white/30 transition-colors">
                        <Play className="w-5 h-5 text-white fill-white" />
                      </div>
                    </button>

                    <div className="flex-1">
                      <p className="text-sm text-gray-600 mb-4">
                        Watch the tutorial video or jump right in and get started.
                      </p>
                      <div className="flex items-center gap-3">
                        <Link to={step.href}>
                          <Button>{step.completed ? "Review" : "Start"}</Button>
                        </Link>
                        {!step.completed && (
                          <Button variant="secondary">Mark Complete</Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Completion */}
      {completedCount === steps.length && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-green-600" />
          </div>
          <h3 className="text-lg font-semibold text-green-800 mb-2">You're all set!</h3>
          <p className="text-green-700 mb-4">You've completed all the getting started steps.</p>
          <Link to="/venue">
            <Button>Go to Dashboard</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

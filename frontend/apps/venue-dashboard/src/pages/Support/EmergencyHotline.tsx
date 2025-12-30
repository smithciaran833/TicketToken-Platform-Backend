import { Link } from "react-router-dom";
import { ArrowLeft, Phone, AlertTriangle, Clock, CheckCircle } from "lucide-react";
import { Button } from "../../components/ui";

const emergencyTypes = [
  "Event currently in progress with critical issue",
  "Security incident at venue",
  "Payment system completely down during sales",
  "Data breach or security compromise",
];

const nonEmergencyTypes = [
  "General questions or how-to inquiries",
  "Feature requests",
  "Billing questions",
  "Non-urgent technical issues",
];

export default function EmergencyHotline() {
  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Emergency Hotline</h1>
          <p className="text-gray-500">For critical issues only</p>
        </div>
      </div>

      {/* Warning */}
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
        <div className="flex items-start gap-4">
          <AlertTriangle className="w-8 h-8 text-red-600 flex-shrink-0" />
          <div>
            <h2 className="text-lg font-semibold text-red-800 mb-2">Emergency Support Only</h2>
            <p className="text-red-700 mb-4">
              This line is reserved for critical issues that require immediate attention. 
              Misuse may result in delayed response times for actual emergencies.
            </p>
          </div>
        </div>
      </div>

      {/* Phone Number */}
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center mb-6">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Phone className="w-8 h-8 text-red-600" />
        </div>
        <p className="text-sm text-gray-500 mb-2">Emergency Hotline</p>
        <p className="text-4xl font-bold text-gray-900 mb-2">1-800-555-URGENT</p>
        <div className="flex items-center justify-center gap-2 text-green-600">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">Available 24/7</span>
        </div>
        <a href="tel:1-800-555-8743">
          <Button className="mt-6 bg-red-600 hover:bg-red-700">
            <Phone className="w-4 h-4" />
            Call Now
          </Button>
        </a>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* When to Call */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            When to Call
          </h3>
          <ul className="space-y-2">
            {emergencyTypes.map((type, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="text-green-600 mt-1">•</span>
                {type}
              </li>
            ))}
          </ul>
        </div>

        {/* When NOT to Call */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-600" />
            Use Regular Support For
          </h3>
          <ul className="space-y-2">
            {nonEmergencyTypes.map((type, index) => (
              <li key={index} className="flex items-start gap-2 text-sm text-gray-600">
                <span className="text-yellow-600 mt-1">•</span>
                {type}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Regular Support Link */}
      <div className="mt-6 text-center">
        <p className="text-gray-500 mb-2">Not an emergency?</p>
        <Link to="/venue/support/contact" className="text-purple-600 hover:text-purple-700 font-medium">
          Contact regular support →
        </Link>
      </div>
    </div>
  );
}

import { Link } from "react-router-dom";
import { ArrowLeft, Mail, Phone, Calendar, MessageCircle } from "lucide-react";
import { Button } from "../../components/ui";

const accountManager = {
  name: "Michael Chen",
  title: "Senior Account Manager",
  email: "michael.chen@tickettoken.com",
  phone: "+1 (555) 987-6543",
  avatar: null,
  availability: "Mon-Fri, 9AM-6PM EST",
  nextMeeting: "January 20, 2025 at 2:00 PM",
};

const recentActivity = [
  { date: "Jan 10, 2025", action: "Quarterly business review completed" },
  { date: "Dec 15, 2024", action: "Helped set up premium support tier" },
  { date: "Nov 20, 2024", action: "Onboarding call for new venue" },
];

export default function AccountManager() {
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Account Manager</h1>
          <p className="text-gray-500">Dedicated support for your venue</p>
        </div>
      </div>

      {/* Account Manager Card */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <div className="flex items-start gap-6">
          <div className="w-24 h-24 bg-gradient-to-br from-purple-500 to-purple-700 rounded-xl flex items-center justify-center text-white text-2xl font-bold flex-shrink-0">
            MC
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h2 className="text-xl font-semibold text-gray-900">{accountManager.name}</h2>
              <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                Premium Support
              </span>
            </div>
            <p className="text-gray-500 mb-4">{accountManager.title}</p>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-gray-600">
                <Mail className="w-4 h-4 text-gray-400" />
                {accountManager.email}
              </div>
              <div className="flex items-center gap-2 text-gray-600">
                <Phone className="w-4 h-4 text-gray-400" />
                {accountManager.phone}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Availability</p>
              <p className="font-medium text-gray-900">{accountManager.availability}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary">
                <Mail className="w-4 h-4" />
                Email
              </Button>
              <Button variant="secondary">
                <Phone className="w-4 h-4" />
                Call
              </Button>
              <Button>
                <Calendar className="w-4 h-4" />
                Schedule Meeting
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Next Meeting */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Upcoming Meeting</h3>
          {accountManager.nextMeeting ? (
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{accountManager.nextMeeting}</p>
                <p className="text-sm text-gray-500">Quarterly Review</p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-gray-500 mb-3">No upcoming meetings</p>
              <Button variant="secondary" size="sm">Schedule Now</Button>
            </div>
          )}
        </div>

        {/* Quick Message */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Quick Message</h3>
          <textarea
            placeholder="Send a quick message to Michael..."
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            rows={3}
          />
          <Button className="mt-3 w-full">
            <MessageCircle className="w-4 h-4" />
            Send Message
          </Button>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mt-6">
        <h3 className="font-semibold text-gray-900 mb-4">Recent Activity</h3>
        <div className="space-y-4">
          {recentActivity.map((activity, index) => (
            <div key={index} className="flex items-center gap-4">
              <div className="w-2 h-2 bg-purple-500 rounded-full" />
              <div>
                <p className="text-gray-900">{activity.action}</p>
                <p className="text-sm text-gray-500">{activity.date}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

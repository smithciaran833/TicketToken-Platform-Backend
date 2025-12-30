import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, Clock, Users, Video, ChevronRight, Check } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

const upcomingSessions = [
  { id: 1, title: "Getting Started with TicketToken", date: "Jan 18, 2025", time: "10:00 AM EST", duration: "60 min", spots: 12, enrolled: false },
  { id: 2, title: "Advanced Ticketing Strategies", date: "Jan 22, 2025", time: "2:00 PM EST", duration: "90 min", spots: 8, enrolled: false },
  { id: 3, title: "Analytics Deep Dive", date: "Jan 25, 2025", time: "11:00 AM EST", duration: "60 min", spots: 15, enrolled: true },
  { id: 4, title: "Marketing Your Events", date: "Jan 30, 2025", time: "1:00 PM EST", duration: "60 min", spots: 20, enrolled: false },
];

const pastSessions = [
  { id: 101, title: "Scanner App Training", date: "Jan 5, 2025", recording: true },
  { id: 102, title: "Q4 Platform Updates", date: "Dec 15, 2024", recording: true },
  { id: 103, title: "Holiday Event Best Practices", date: "Nov 20, 2024", recording: true },
];

export default function TrainingSessions() {
  const toast = useToast();
  const [sessions, setSessions] = useState(upcomingSessions);

  const handleEnroll = (id: number) => {
    setSessions(sessions.map(s => s.id === id ? { ...s, enrolled: true } : s));
    toast.success("Enrolled successfully! Calendar invite sent.");
  };

  const handleUnenroll = (id: number) => {
    setSessions(sessions.map(s => s.id === id ? { ...s, enrolled: false } : s));
    toast.success("Enrollment cancelled");
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Training Sessions</h1>
            <p className="text-gray-500">Live webinars and workshops</p>
          </div>
        </div>
        <Link to="/venue/support/training/materials">
          <Button variant="secondary">
            Training Materials
            <ChevronRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      {/* Upcoming Sessions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Upcoming Sessions</h2>
        <div className="grid grid-cols-2 gap-4">
          {sessions.map((session) => (
            <div key={session.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-gray-900">{session.title}</h3>
                  <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {session.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {session.time}
                    </span>
                  </div>
                </div>
                {session.enrolled && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    Enrolled
                  </span>
                )}
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span className="flex items-center gap-1">
                    <Video className="w-4 h-4" />
                    {session.duration}
                  </span>
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    {session.spots} spots left
                  </span>
                </div>
                {session.enrolled ? (
                  <Button variant="secondary" size="sm" onClick={() => handleUnenroll(session.id)}>
                    Cancel
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => handleEnroll(session.id)}>
                    Enroll
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Past Sessions */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Past Sessions</h2>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Session</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Recording</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {pastSessions.map((session) => (
                <tr key={session.id}>
                  <td className="px-6 py-4 font-medium text-gray-900">{session.title}</td>
                  <td className="px-6 py-4 text-gray-500">{session.date}</td>
                  <td className="px-6 py-4 text-right">
                    {session.recording && (
                      <Button variant="secondary" size="sm">
                        <Video className="w-4 h-4" />
                        Watch
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

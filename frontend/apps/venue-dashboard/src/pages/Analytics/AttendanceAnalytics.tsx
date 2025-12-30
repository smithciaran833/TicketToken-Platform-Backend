import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Download, Users, Clock, UserX, TrendingUp } from "lucide-react";
import { Button } from "../../components/ui";

const events = [
  { value: "all", label: "All Events" },
  { value: "1", label: "Summer Music Festival" },
  { value: "2", label: "Tech Conference" },
  { value: "5", label: "Jazz Night" },
];

const checkInTimeline = [
  { time: "5:00 PM", count: 0 },
  { time: "5:30 PM", count: 156 },
  { time: "6:00 PM", count: 423 },
  { time: "6:30 PM", count: 712 },
  { time: "7:00 PM", count: 834 },
  { time: "7:30 PM", count: 891 },
  { time: "8:00 PM", count: 912 },
];

const peakTimes = [
  { time: "6:00 PM - 6:30 PM", checkIns: 267, percent: 29 },
  { time: "6:30 PM - 7:00 PM", checkIns: 289, percent: 32 },
  { time: "5:30 PM - 6:00 PM", checkIns: 156, percent: 17 },
  { time: "7:00 PM - 7:30 PM", checkIns: 122, percent: 13 },
];

const entryPoints = [
  { name: "Main Gate", checkIns: 612, percent: 67 },
  { name: "VIP Entrance", checkIns: 178, percent: 19 },
  { name: "Will Call", checkIns: 122, percent: 14 },
];

const noShows = [
  { name: "Alex Johnson", email: "alex@email.com", ticketType: "General Admission", orderDate: "Jun 15" },
  { name: "Maria Garcia", email: "maria@email.com", ticketType: "VIP Access", orderDate: "Jun 18" },
  { name: "James Wilson", email: "james@email.com", ticketType: "General Admission", orderDate: "Jun 20" },
  { name: "Sarah Brown", email: "sarah@email.com", ticketType: "Early Bird", orderDate: "Jun 10" },
];

export default function AttendanceAnalytics() {
  const [eventFilter, setEventFilter] = useState("1");

  const maxTimeline = Math.max(...checkInTimeline.map(t => t.count));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/analytics" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Attendance Analytics</h1>
            <p className="text-gray-500">Check-in data and no-show tracking</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {events.map(event => (
              <option key={event.value} value={event.value}>{event.label}</option>
            ))}
          </select>
          <Button variant="secondary">
            <Download className="w-4 h-4" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Tickets Sold</p>
              <p className="text-3xl font-bold text-gray-900">1,432</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Check-ins</p>
              <p className="text-3xl font-bold text-green-600">912</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">No-Show Rate</p>
              <p className="text-3xl font-bold text-red-600">8.2%</p>
            </div>
            <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
              <UserX className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Avg Check-in Time</p>
              <p className="text-3xl font-bold text-gray-900">6:18 PM</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Check-in Timeline */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Check-in Timeline</h2>
        <div className="h-48 flex items-end justify-between gap-3">
          {checkInTimeline.map((point, index) => (
            <div key={index} className="flex-1 flex flex-col items-center">
              <div className="text-xs font-medium text-gray-600 mb-1">{point.count}</div>
              <div 
                className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                style={{ height: `${(point.count / maxTimeline) * 150}px` }}
              />
              <span className="text-xs text-gray-500 mt-2">{point.time}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Peak Times */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Peak Check-in Times</h2>
          <div className="space-y-3">
            {peakTimes.map((peak, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{peak.time}</p>
                  <p className="text-sm text-gray-500">{peak.checkIns} check-ins</p>
                </div>
                <span className="text-lg font-bold text-purple-600">{peak.percent}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Entry Point Breakdown */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Entry Point Breakdown</h2>
          <div className="space-y-4">
            {entryPoints.map((entry, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{entry.name}</span>
                  <span className="text-sm text-gray-600">{entry.checkIns} ({entry.percent}%)</span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full">
                  <div 
                    className="h-3 bg-blue-500 rounded-full"
                    style={{ width: `${entry.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* No-Shows */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">No-Shows ({noShows.length})</h2>
          <Button variant="secondary" size="sm">
            <Download className="w-4 h-4" />
            Export List
          </Button>
        </div>
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Attendee</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Order Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {noShows.map((person, index) => (
              <tr key={index} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <p className="font-medium text-gray-900">{person.name}</p>
                  <p className="text-sm text-gray-500">{person.email}</p>
                </td>
                <td className="px-6 py-4 text-gray-600">{person.ticketType}</td>
                <td className="px-6 py-4 text-gray-600">{person.orderDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

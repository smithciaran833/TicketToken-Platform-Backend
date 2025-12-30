import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Clock, Phone, MessageSquare, Users } from "lucide-react";
import { Button } from "../../components/ui";

const events = [
  { value: "1", label: "Summer Music Festival - Today" },
  { value: "2", label: "Jazz Night - Jul 20" },
];

const onDutyStaff = [
  { id: 1, name: "Sarah Johnson", role: "Manager", assignment: "Floor", checkInTime: "3:45 PM", duration: "2h 15m", phone: "(555) 123-4567" },
  { id: 2, name: "Emily Davis", role: "Security", assignment: "Main Gate", checkInTime: "4:55 PM", duration: "1h 05m", phone: "(555) 234-5678" },
  { id: 3, name: "Mike Chen", role: "Box Office", assignment: "Box Office", checkInTime: "3:50 PM", duration: "2h 10m", phone: "(555) 345-6789" },
  { id: 4, name: "Lisa Brown", role: "VIP Host", assignment: "VIP Entrance", checkInTime: "5:30 PM", duration: "30m", phone: "(555) 456-7890" },
];

const byLocation = [
  { location: "Main Gate", count: 1, staff: ["Emily Davis"] },
  { location: "VIP Entrance", count: 1, staff: ["Lisa Brown"] },
  { location: "Box Office", count: 1, staff: ["Mike Chen"] },
  { location: "Floor", count: 1, staff: ["Sarah Johnson"] },
];

const byRole = [
  { role: "Manager", count: 1 },
  { role: "Security", count: 1 },
  { role: "Box Office", count: 1 },
  { role: "VIP Host", count: 1 },
];

export default function StaffOnDuty() {
  const [selectedEvent, setSelectedEvent] = useState("1");

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/team" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Staff On Duty</h1>
            <p className="text-gray-500">Currently working staff</p>
          </div>
        </div>
        <Link to="/venue/team/announcements">
          <Button variant="secondary">
            <MessageSquare className="w-4 h-4" />
            Message All
          </Button>
        </Link>
      </div>

      {/* Event Selector */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <Calendar className="w-5 h-5 text-gray-400" />
          <select
            value={selectedEvent}
            onChange={(e) => setSelectedEvent(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {events.map(e => <option key={e.value} value={e.value}>{e.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* On Duty List */}
        <div className="col-span-2">
          <div className="bg-white rounded-lg border border-gray-200">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Currently On Duty</h2>
              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                {onDutyStaff.length} Active
              </span>
            </div>
            <div className="divide-y divide-gray-200">
              {onDutyStaff.map((staff) => (
                <div key={staff.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-medium">
                      {staff.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{staff.name}</p>
                      <p className="text-sm text-gray-500">{staff.role}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="flex items-center gap-1 text-sm text-gray-600">
                        <MapPin className="w-4 h-4" />
                        {staff.assignment}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        {staff.duration} on duty
                      </div>
                    </div>
                    <a href={`tel:${staff.phone}`} className="p-2 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg">
                      <Phone className="w-5 h-5" />
                    </a>
                  </div>
                </div>
              ))}
              {onDutyStaff.length === 0 && (
                <div className="px-6 py-12 text-center text-gray-500">
                  No staff currently on duty.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Breakdowns */}
        <div className="space-y-6">
          {/* By Location */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">By Location</h3>
            <div className="space-y-3">
              {byLocation.map((loc, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{loc.location}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{loc.count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* By Role */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">By Role</h3>
            <div className="space-y-3">
              {byRole.map((r, index) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-700">{r.role}</span>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{r.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, UserCheck, UserX, QrCode, Search } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

const events = [
  { value: "1", label: "Summer Music Festival - Today" },
  { value: "2", label: "Jazz Night - Jul 20" },
];

const staffOnDuty = [
  { id: 1, name: "Sarah Johnson", role: "Manager", assignment: "Floor", shiftStart: "4:00 PM", status: "checked-in", checkedInAt: "3:45 PM" },
  { id: 2, name: "Emily Davis", role: "Security", assignment: "Main Gate", shiftStart: "5:00 PM", status: "checked-in", checkedInAt: "4:55 PM" },
  { id: 3, name: "Tom Wilson", role: "Scanner", assignment: "Main Gate", shiftStart: "5:00 PM", status: "pending", checkedInAt: null },
  { id: 4, name: "Lisa Brown", role: "VIP Host", assignment: "VIP Entrance", shiftStart: "6:00 PM", status: "pending", checkedInAt: null },
  { id: 5, name: "Mike Chen", role: "Box Office", assignment: "Box Office", shiftStart: "4:00 PM", status: "checked-in", checkedInAt: "3:50 PM" },
];

export default function StaffCheckIn() {
  const toast = useToast();
  const [selectedEvent, setSelectedEvent] = useState("1");
  const [staff, setStaff] = useState(staffOnDuty);
  const [searchQuery, setSearchQuery] = useState("");

  const checkedIn = staff.filter(s => s.status === "checked-in").length;
  const pending = staff.filter(s => s.status === "pending").length;

  const handleCheckIn = (staffId: number) => {
    setStaff(staff.map(s => 
      s.id === staffId 
        ? { ...s, status: "checked-in", checkedInAt: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) }
        : s
    ));
    toast.success("Staff checked in!");
  };

  const handleCheckOut = (staffId: number) => {
    setStaff(staff.map(s => 
      s.id === staffId 
        ? { ...s, status: "checked-out", checkedInAt: null }
        : s
    ));
    toast.success("Staff checked out");
  };

  const filteredStaff = staff.filter(s => 
    s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/team" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Staff Check-In</h1>
            <p className="text-gray-500">Track staff attendance</p>
          </div>
        </div>
        <Button variant="secondary">
          <QrCode className="w-4 h-4" />
          QR Check-In
        </Button>
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

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Assigned</p>
          <p className="text-2xl font-bold text-gray-900">{staff.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Checked In</p>
          <p className="text-2xl font-bold text-green-600">{checkedIn}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Pending</p>
          <p className="text-2xl font-bold text-yellow-600">{pending}</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search staff..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          />
        </div>
      </div>

      {/* Staff List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Staff</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assignment</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Shift Start</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredStaff.map((member) => (
              <tr key={member.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-medium">
                      {member.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{member.name}</p>
                      <p className="text-sm text-gray-500">{member.role}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{member.assignment}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{member.shiftStart}</td>
                <td className="px-6 py-4">
                  {member.status === "checked-in" ? (
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                        Checked In
                      </span>
                      <span className="text-xs text-gray-500">{member.checkedInAt}</span>
                    </div>
                  ) : (
                    <span className="px-2 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
                      Pending
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  {member.status === "checked-in" ? (
                    <Button size="sm" variant="secondary" onClick={() => handleCheckOut(member.id)}>
                      <UserX className="w-4 h-4" />
                      Check Out
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => handleCheckIn(member.id)}>
                      <UserCheck className="w-4 h-4" />
                      Check In
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

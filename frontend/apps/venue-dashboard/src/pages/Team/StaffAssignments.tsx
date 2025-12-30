import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Calendar, MapPin, Clock, Trash2 } from "lucide-react";
import { Button, Select, Modal, ModalFooter, Input, useToast, ToastContainer } from "../../components/ui";

const events = [
  { value: "", label: "Select an event..." },
  { value: "1", label: "Summer Music Festival - Jul 15, 2025" },
  { value: "2", label: "Tech Conference - Sep 15, 2025" },
  { value: "5", label: "Jazz Night - Jul 20, 2025" },
];

const staffMembers = [
  { id: 1, name: "Sarah Johnson", role: "Manager" },
  { id: 2, name: "Mike Chen", role: "Box Office" },
  { id: 3, name: "Emily Davis", role: "Security" },
  { id: 4, name: "Tom Wilson", role: "Scanner" },
  { id: 5, name: "Lisa Brown", role: "VIP Host" },
];

const positions = [
  { value: "main-gate", label: "Main Gate" },
  { value: "vip-entrance", label: "VIP Entrance" },
  { value: "box-office", label: "Box Office" },
  { value: "backstage", label: "Backstage" },
  { value: "floor", label: "Floor" },
  { value: "balcony", label: "Balcony" },
];

const mockAssignments = [
  { id: 1, staffId: 1, staffName: "Sarah Johnson", role: "Manager", position: "Floor", shift: "4:00 PM - 12:00 AM" },
  { id: 2, staffId: 3, staffName: "Emily Davis", role: "Security", position: "Main Gate", shift: "5:00 PM - 11:00 PM" },
  { id: 3, staffId: 4, staffName: "Tom Wilson", role: "Scanner", position: "Main Gate", shift: "5:00 PM - 9:00 PM" },
  { id: 4, staffId: 5, staffName: "Lisa Brown", role: "VIP Host", position: "VIP Entrance", shift: "6:00 PM - 12:00 AM" },
];

export default function StaffAssignments() {
  const toast = useToast();
  const [selectedEvent, setSelectedEvent] = useState("1");
  const [assignments, setAssignments] = useState(mockAssignments);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newAssignment, setNewAssignment] = useState({
    staffId: "",
    position: "",
    shiftStart: "",
    shiftEnd: "",
  });

  const unassignedStaff = staffMembers.filter(s => !assignments.find(a => a.staffId === s.id));

  const handleAddAssignment = () => {
    if (!newAssignment.staffId || !newAssignment.position) {
      toast.error("Please select staff and position");
      return;
    }
    toast.success("Staff assigned!");
    setShowAddModal(false);
    setNewAssignment({ staffId: "", position: "", shiftStart: "", shiftEnd: "" });
  };

  const handleRemoveAssignment = (id: number) => {
    setAssignments(assignments.filter(a => a.id !== id));
    toast.success("Assignment removed");
  };

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
            <h1 className="text-3xl font-bold text-gray-900">Staff Assignments</h1>
            <p className="text-gray-500">Assign staff to events</p>
          </div>
        </div>
        <Button onClick={() => setShowAddModal(true)}>
          <Plus className="w-4 h-4" />
          Add Assignment
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

      {selectedEvent ? (
        <div className="grid grid-cols-3 gap-6">
          {/* Assigned Staff */}
          <div className="col-span-2">
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Assigned Staff ({assignments.length})</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {assignments.map((assignment) => (
                  <div key={assignment.id} className="px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-medium">
                        {assignment.staffName.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{assignment.staffName}</p>
                        <p className="text-sm text-gray-500">{assignment.role}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <MapPin className="w-4 h-4" />
                          {assignment.position}
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <Clock className="w-4 h-4" />
                          {assignment.shift}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleRemoveAssignment(assignment.id)}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
                {assignments.length === 0 && (
                  <div className="px-6 py-12 text-center text-gray-500">
                    No staff assigned to this event yet.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Unassigned Staff */}
          <div>
            <div className="bg-white rounded-lg border border-gray-200">
              <div className="px-6 py-4 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Available Staff</h2>
              </div>
              <div className="divide-y divide-gray-200">
                {unassignedStaff.map((staff) => (
                  <div key={staff.id} className="px-6 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center text-gray-600 text-sm font-medium">
                        {staff.name.split(" ").map(n => n[0]).join("")}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{staff.name}</p>
                        <p className="text-xs text-gray-500">{staff.role}</p>
                      </div>
                    </div>
                    <Button size="sm" variant="secondary" onClick={() => { setNewAssignment({ ...newAssignment, staffId: String(staff.id) }); setShowAddModal(true); }}>
                      Assign
                    </Button>
                  </div>
                ))}
                {unassignedStaff.length === 0 && (
                  <div className="px-6 py-8 text-center text-gray-500 text-sm">
                    All staff assigned
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-12 text-center">
          <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Select an Event</h3>
          <p className="text-gray-500">Choose an event to manage staff assignments.</p>
        </div>
      )}

      {/* Add Assignment Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Assignment"
      >
        <div className="space-y-4">
          <Select
            label="Staff Member"
            options={[{ value: "", label: "Select staff..." }, ...staffMembers.map(s => ({ value: String(s.id), label: `${s.name} (${s.role})` }))]}
            value={newAssignment.staffId}
            onChange={(e) => setNewAssignment({ ...newAssignment, staffId: e.target.value })}
          />
          <Select
            label="Position"
            options={[{ value: "", label: "Select position..." }, ...positions]}
            value={newAssignment.position}
            onChange={(e) => setNewAssignment({ ...newAssignment, position: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Shift Start"
              type="time"
              value={newAssignment.shiftStart}
              onChange={(e) => setNewAssignment({ ...newAssignment, shiftStart: e.target.value })}
            />
            <Input
              label="Shift End"
              type="time"
              value={newAssignment.shiftEnd}
              onChange={(e) => setNewAssignment({ ...newAssignment, shiftEnd: e.target.value })}
            />
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
          <Button onClick={handleAddAssignment}>Add Assignment</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

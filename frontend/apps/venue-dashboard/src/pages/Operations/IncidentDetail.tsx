import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Edit, Plus, CheckCircle, Clock, User, MapPin, Calendar, AlertTriangle } from "lucide-react";
import { Button, Textarea, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const incident = {
  id: 1,
  event: "Summer Music Festival",
  eventDate: "Jul 15, 2025",
  type: "Medical",
  severity: "high",
  status: "open",
  dateTime: "2025-01-15 8:30 PM",
  location: "Section A, near stage left",
  description: "Attendee fainted near the stage during the opening act. Security was notified and first aid was administered on site. Paramedics were called as a precaution.",
  actionsTaken: "First aid administered, area cleared, paramedics called. Attendee regained consciousness and was evaluated by EMTs.",
  people: [
    { type: "Customer", name: "Jane Smith", details: "Ticket #12345" },
    { type: "Staff", name: "Mike Johnson", details: "Security Team Lead" },
  ],
  witnesses: "Multiple nearby attendees, names not collected",
  photos: [],
  notes: [
    { id: 1, author: "Mike Johnson", date: "2025-01-15 8:45 PM", content: "EMTs arrived and evaluated the attendee. Vital signs normal." },
    { id: 2, author: "Sarah Wilson", date: "2025-01-15 9:00 PM", content: "Attendee declined transport to hospital, signed waiver. Provided water and escorted to first aid tent for observation." },
  ],
};

export default function IncidentDetail() {
  const { id } = useParams();
  const toast = useToast();

  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showResolveModal, setShowResolveModal] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [resolution, setResolution] = useState("");

  const handleAddNote = () => {
    if (!newNote.trim()) {
      toast.error("Please enter a note");
      return;
    }
    toast.success("Note added");
    setNewNote("");
    setShowNoteModal(false);
  };

  const handleResolve = () => {
    if (!resolution.trim()) {
      toast.error("Please enter resolution details");
      return;
    }
    toast.success("Incident marked as resolved");
    setShowResolveModal(false);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/operations/incidents" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">Incident #{incident.id}</h1>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                incident.status === "open" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"
              }`}>
                {incident.status}
              </span>
              <span className={`px-3 py-1 text-sm font-medium rounded-full ${
                incident.severity === "high" ? "bg-red-100 text-red-700" :
                incident.severity === "medium" ? "bg-yellow-100 text-yellow-700" :
                "bg-gray-100 text-gray-700"
              }`}>
                {incident.severity} severity
              </span>
            </div>
            <p className="text-gray-500">{incident.type} incident</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary">
            <Edit className="w-4 h-4" />
            Edit
          </Button>
          {incident.status === "open" && (
            <Button onClick={() => setShowResolveModal(true)}>
              <CheckCircle className="w-4 h-4" />
              Mark Resolved
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="col-span-2 space-y-6">
          {/* Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Incident Summary</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Event</p>
                  <p className="font-medium text-gray-900">{incident.event}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Date/Time</p>
                  <p className="font-medium text-gray-900">{incident.dateTime}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Type</p>
                  <p className="font-medium text-gray-900">{incident.type}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <MapPin className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Location</p>
                  <p className="font-medium text-gray-900">{incident.location}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Description</h2>
            <p className="text-gray-700">{incident.description}</p>
          </div>

          {/* Actions Taken */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Actions Taken</h2>
            <p className="text-gray-700">{incident.actionsTaken}</p>
          </div>

          {/* Follow-up Notes */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Follow-up Notes</h2>
              <Button variant="secondary" size="sm" onClick={() => setShowNoteModal(true)}>
                <Plus className="w-4 h-4" />
                Add Note
              </Button>
            </div>
            <div className="space-y-4">
              {incident.notes.map((note) => (
                <div key={note.id} className="border-l-2 border-purple-500 pl-4">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-medium text-gray-900">{note.author}</p>
                    <span className="text-sm text-gray-500">{note.date}</span>
                  </div>
                  <p className="text-gray-700">{note.content}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* People Involved */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">People Involved</h2>
            <div className="space-y-3">
              {incident.people.map((person, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{person.name}</p>
                    <p className="text-sm text-gray-500">{person.type} • {person.details}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Witnesses */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Witnesses</h2>
            <p className="text-gray-700 text-sm">{incident.witnesses}</p>
          </div>

          {/* Photos */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3">Photos</h2>
            {incident.photos.length === 0 ? (
              <p className="text-sm text-gray-500">No photos attached</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {incident.photos.map((photo, index) => (
                  <div key={index} className="aspect-square bg-gray-100 rounded-lg" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Note Modal */}
      <Modal isOpen={showNoteModal} onClose={() => setShowNoteModal(false)} title="Add Follow-up Note">
        <Textarea
          label="Note"
          placeholder="Enter your follow-up note..."
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          rows={4}
        />
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowNoteModal(false)}>Cancel</Button>
          <Button onClick={handleAddNote}>Add Note</Button>
        </ModalFooter>
      </Modal>

      {/* Resolve Modal */}
      <Modal isOpen={showResolveModal} onClose={() => setShowResolveModal(false)} title="Resolve Incident">
        <p className="text-gray-600 mb-4">Please provide resolution details for this incident.</p>
        <Textarea
          label="Resolution"
          placeholder="Describe how this incident was resolved..."
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          rows={4}
        />
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowResolveModal(false)}>Cancel</Button>
          <Button onClick={handleResolve}>Mark Resolved</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

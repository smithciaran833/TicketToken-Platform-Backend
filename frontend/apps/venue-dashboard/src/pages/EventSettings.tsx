import { useState } from "react";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button, Modal, ModalFooter, Toggle, useToast, ToastContainer } from "../components/ui";

const mockEvents: Record<number, { name: string; date: string; time: string; description: string; isPublic: boolean; passwordProtected: boolean; refundPolicy: string }> = {
  1: { name: "Summer Music Festival", date: "2025-08-15", time: "18:00", description: "Join us for the biggest music festival of the summer featuring top artists from around the world.", isPublic: true, passwordProtected: false, refundPolicy: "full-7" },
  2: { name: "Tech Conference: Innovation Summit", date: "2025-08-22", time: "09:00", description: "A two-day conference featuring the brightest minds in technology.", isPublic: true, passwordProtected: false, refundPolicy: "full-14" },
  3: { name: "Stand-Up Comedy Night", date: "2025-06-10", time: "20:00", description: "An evening of laughs with top comedians.", isPublic: true, passwordProtected: false, refundPolicy: "full-7" },
  4: { name: "Art Gallery Opening", date: "2025-09-05", time: "19:00", description: "Exclusive opening night for our new contemporary art exhibition.", isPublic: false, passwordProtected: true, refundPolicy: "no-refund" },
  5: { name: "Jazz Night", date: "2025-07-20", time: "20:00", description: "An intimate evening of jazz featuring local and international artists.", isPublic: true, passwordProtected: false, refundPolicy: "full-7" },
  6: { name: "Cancelled Show", date: "2025-07-01", time: "19:00", description: "This event has been cancelled.", isPublic: true, passwordProtected: false, refundPolicy: "full-7" },
};

const tabs = [
  { name: "Overview", path: "" },
  { name: "Tickets", path: "/tickets" },
  { name: "Sales", path: "/sales" },
  { name: "Guest List", path: "/guests" },
  { name: "Settings", path: "/settings" },
];

export default function EventSettings() {
  const { id } = useParams();
  const navigate = useNavigate();
  const basePath = "/venue/events/" + id;
  const toast = useToast();
  
  const eventId = parseInt(id || "1");
  const initialEvent = mockEvents[eventId] || mockEvents[1];

  const [formData, setFormData] = useState({
    name: initialEvent.name,
    date: initialEvent.date,
    time: initialEvent.time,
    description: initialEvent.description,
    isPublic: initialEvent.isPublic,
    passwordProtected: initialEvent.passwordProtected,
    refundPolicy: initialEvent.refundPolicy,
  });
  
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleSave = () => {
    toast.success("Settings saved successfully!");
  };

  const handleCancelEvent = () => {
    toast.success("Event cancelled. All ticket holders will be refunded.");
    setShowCancelModal(false);
    navigate("/venue/events");
  };

  const handleDeleteEvent = () => {
    toast.success("Event deleted permanently.");
    setShowDeleteModal(false);
    navigate("/venue/events");
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{formData.name}</h1>
            <p className="text-gray-500 mt-1">Event settings and configuration</p>
          </div>
        </div>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Settings"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Basic Information</h2>
          </div>
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Time</label>
                <input
                  type="time"
                  value={formData.time}
                  onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                rows={4}
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
            <div className="pt-4">
              <Button onClick={handleSave}>Save Changes</Button>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Visibility</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Public Event</p>
                <p className="text-sm text-gray-500">Event is visible to everyone</p>
              </div>
              <Toggle
                enabled={formData.isPublic}
                onChange={(val) => setFormData({ ...formData, isPublic: val })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Password Protected</p>
                <p className="text-sm text-gray-500">Require password to view event</p>
              </div>
              <Toggle
                enabled={formData.passwordProtected}
                onChange={(val) => setFormData({ ...formData, passwordProtected: val })}
              />
            </div>
            {formData.passwordProtected && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Event Password</label>
                <input
                  type="text"
                  placeholder="Enter password"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                />
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Refund Policy</h2>
          </div>
          <div className="p-6">
            <select 
              value={formData.refundPolicy}
              onChange={(e) => setFormData({ ...formData, refundPolicy: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            >
              <option value="full-7">Full refund until 7 days before event</option>
              <option value="full-14">Full refund until 14 days before event</option>
              <option value="full-30">Full refund until 30 days before event</option>
              <option value="no-refund">No refunds</option>
            </select>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-red-200 shadow-sm">
          <div className="px-6 py-4 border-b border-red-200 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-semibold text-red-600">Danger Zone</h2>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Cancel Event</p>
                <p className="text-sm text-gray-500">Cancel this event and refund all tickets</p>
              </div>
              <Button variant="danger" onClick={() => setShowCancelModal(true)}>
                Cancel Event
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-900">Delete Event</p>
                <p className="text-sm text-gray-500">Permanently delete this event (cannot be undone)</p>
              </div>
              <Button variant="danger" onClick={() => setShowDeleteModal(true)}>
                Delete Event
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Event Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Event"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800 font-medium">Warning: This action cannot be undone</p>
            <p className="text-sm text-red-700 mt-1">
              Cancelling "{formData.name}" will automatically refund all ticket holders.
            </p>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Keep Event</Button>
          <Button variant="danger" onClick={handleCancelEvent}>Cancel Event & Refund All</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Event Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Event"
        size="md"
      >
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800 font-medium">Warning: This action is permanent</p>
            <p className="text-sm text-red-700 mt-1">
              Deleting "{formData.name}" will remove all associated data including tickets, orders, and guest lists.
            </p>
          </div>
          <p className="text-sm text-gray-600">
            Type <span className="font-mono font-bold">DELETE</span> to confirm:
          </p>
          <input
            type="text"
            placeholder="Type DELETE to confirm"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteEvent}>Delete Permanently</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

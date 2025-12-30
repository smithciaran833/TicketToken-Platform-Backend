import { ArrowLeft, Plus, Download, Search, MoreVertical, Check, X, Mail, Edit, Trash2 } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { useState } from "react";
import { Modal, ModalFooter, Button, Dropdown, ToastContainer, useToast } from "../components/ui";

const mockEvents: Record<number, string> = {
  1: "Summer Music Festival",
  2: "Tech Conference: Innovation Summit",
  3: "Stand-Up Comedy Night",
  4: "Art Gallery Opening",
  5: "Jazz Night",
  6: "Cancelled Show",
};

const allGuests = [
  // Event 1
  { id: 1, eventId: 1, name: "VIP Guest 1", email: "vip1@email.com", tickets: 2, type: "VIP", addedBy: "John Doe", checkedIn: true },
  { id: 2, eventId: 1, name: "Press - Rolling Stone", email: "press@rollingstone.com", tickets: 2, type: "Press", addedBy: "John Doe", checkedIn: false },
  { id: 3, eventId: 1, name: "Artist +1", email: "artist.guest@email.com", tickets: 1, type: "Artist Guest", addedBy: "Sarah Johnson", checkedIn: false },
  { id: 4, eventId: 1, name: "Sponsor Rep", email: "sponsor@company.com", tickets: 4, type: "Sponsor", addedBy: "John Doe", checkedIn: true },
  // Event 2
  { id: 5, eventId: 2, name: "Tech Blogger Jane", email: "jane@techblog.com", tickets: 1, type: "Press", addedBy: "John Doe", checkedIn: false },
  { id: 6, eventId: 2, name: "Investor Bob", email: "bob@vc.com", tickets: 2, type: "VIP", addedBy: "John Doe", checkedIn: false },
  // Event 5
  { id: 7, eventId: 5, name: "Jazz Critic", email: "critic@jazzweekly.com", tickets: 2, type: "Press", addedBy: "Sarah Manager", checkedIn: false },
];

const tabs = [
  { name: "Overview", path: "" },
  { name: "Tickets", path: "/tickets" },
  { name: "Sales", path: "/sales" },
  { name: "Guest List", path: "/guests" },
  { name: "Settings", path: "/settings" },
];

const guestTypes = ["VIP", "Press", "Artist Guest", "Sponsor", "Industry", "Other"];

export default function EventGuests() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();

  const eventId = parseInt(id || "1");
  const eventName = mockEvents[eventId] || "Event";

  const [guests, setGuests] = useState(allGuests.filter(g => g.eventId === eventId));
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [guestToDelete, setGuestToDelete] = useState<number | null>(null);
  const [guestToEdit, setGuestToEdit] = useState<typeof allGuests[0] | null>(null);
  const [newGuest, setNewGuest] = useState({ name: "", email: "", tickets: 1, type: "VIP" });
  const [editForm, setEditForm] = useState({ name: "", email: "", tickets: 1, type: "VIP" });

  // Filter guests
  let filteredGuests = guests;
  
  if (typeFilter !== "All") {
    filteredGuests = filteredGuests.filter(g => g.type === typeFilter);
  }
  
  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    filteredGuests = filteredGuests.filter(g => 
      g.name.toLowerCase().includes(query) ||
      g.email.toLowerCase().includes(query)
    );
  }

  const checkedInCount = guests.filter(g => g.checkedIn).length;

  const handleAddGuest = () => {
    const guest = {
      id: Math.max(...guests.map(g => g.id), 0) + 1,
      eventId,
      ...newGuest,
      addedBy: "John Doe",
      checkedIn: false,
    };
    setGuests([...guests, guest]);
    setShowAddModal(false);
    setNewGuest({ name: "", email: "", tickets: 1, type: "VIP" });
    toast.success("Guest added successfully!");
  };

  const handleEditGuest = () => {
    if (guestToEdit) {
      setGuests(guests.map(g =>
        g.id === guestToEdit.id
          ? { ...g, ...editForm }
          : g
      ));
      setShowEditModal(false);
      setGuestToEdit(null);
      toast.success("Guest updated successfully!");
    }
  };

  const handleDeleteGuest = () => {
    if (guestToDelete) {
      setGuests(guests.filter(g => g.id !== guestToDelete));
      setShowDeleteModal(false);
      setGuestToDelete(null);
      toast.success("Guest removed from list");
    }
  };

  const handleResendConfirmation = (guest: typeof allGuests[0]) => {
    toast.success(`Confirmation sent to ${guest.email}`);
  };

  const handleExport = () => {
    toast.success("Exporting guest list to CSV...");
  };

  const openEditModal = (guest: typeof allGuests[0]) => {
    setGuestToEdit(guest);
    setEditForm({ name: guest.name, email: guest.email, tickets: guest.tickets, type: guest.type });
    setShowEditModal(true);
  };

  const getDropdownItems = (guest: typeof allGuests[0]) => [
    {
      label: "Edit Guest",
      icon: <Edit className="w-4 h-4" />,
      onClick: () => openEditModal(guest),
    },
    {
      label: "Resend Confirmation",
      icon: <Mail className="w-4 h-4" />,
      onClick: () => handleResendConfirmation(guest),
    },
    { divider: true, label: "", onClick: () => {} },
    {
      label: "Remove Guest",
      icon: <Trash2 className="w-4 h-4" />,
      danger: true,
      onClick: () => {
        setGuestToDelete(guest.id);
        setShowDeleteModal(true);
      },
    },
  ];

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{eventName}</h1>
            <p className="text-gray-500 mt-1">Manage complimentary tickets</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={handleExport}>
            <Download className="w-5 h-5" />
            <span>Export</span>
          </Button>
          <Button onClick={() => setShowAddModal(true)}>
            <Plus className="w-5 h-5" />
            <span>Add Guest</span>
          </Button>
        </div>
      </div>

      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Guest List"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Guests</p>
          <p className="text-2xl font-bold text-gray-900">{guests.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Checked In</p>
          <p className="text-2xl font-bold text-green-600">{checkedInCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Remaining</p>
          <p className="text-2xl font-bold text-gray-900">{guests.length - checkedInCount}</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search guests..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
        <select 
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
        >
          <option value="All">All Types</option>
          {guestTypes.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Guest</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tickets</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Added By</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Checked In</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredGuests.map((guest) => (
              <tr key={guest.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="text-sm font-medium text-gray-900">{guest.name}</div>
                  <div className="text-sm text-gray-500">{guest.email}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-purple-100 text-purple-700">
                    {guest.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900">{guest.tickets}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{guest.addedBy}</td>
                <td className="px-6 py-4">
                  {guest.checkedIn ? (
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <Check className="w-4 h-4" />
                      <span className="text-sm">Yes</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-400">
                      <X className="w-4 h-4" />
                      <span className="text-sm">No</span>
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <Dropdown
                    trigger={<MoreVertical className="w-5 h-5" />}
                    items={getDropdownItems(guest)}
                  />
                </td>
              </tr>
            ))}
            {filteredGuests.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  {searchQuery || typeFilter !== "All" ? "No guests match your filters" : "No guests yet. Click 'Add Guest' to add one."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add Guest Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="Add Guest"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={newGuest.name}
              onChange={(e) => setNewGuest({ ...newGuest, name: e.target.value })}
              placeholder="Guest name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={newGuest.email}
              onChange={(e) => setNewGuest({ ...newGuest, email: e.target.value })}
              placeholder="guest@email.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest Type</label>
              <select
                value={newGuest.type}
                onChange={(e) => setNewGuest({ ...newGuest, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                {guestTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Tickets</label>
              <input
                type="number"
                min="1"
                max="10"
                value={newGuest.tickets}
                onChange={(e) => setNewGuest({ ...newGuest, tickets: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
          <Button onClick={handleAddGuest}>Add Guest</Button>
        </ModalFooter>
      </Modal>

      {/* Edit Guest Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Guest"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="Guest name"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={editForm.email}
              onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              placeholder="guest@email.com"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Guest Type</label>
              <select
                value={editForm.type}
                onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              >
                {guestTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Number of Tickets</label>
              <input
                type="number"
                min="1"
                max="10"
                value={editForm.tickets}
                onChange={(e) => setEditForm({ ...editForm, tickets: parseInt(e.target.value) })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
              />
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowEditModal(false)}>Cancel</Button>
          <Button onClick={handleEditGuest}>Save Changes</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Remove Guest"
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to remove this guest from the list? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDeleteGuest}>Remove Guest</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

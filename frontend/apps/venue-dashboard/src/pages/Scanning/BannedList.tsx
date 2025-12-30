import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Search, MoreVertical, Edit, Trash2, User } from "lucide-react";
import { Button, Modal, ModalFooter, Input, Select, Textarea, Dropdown, useToast, ToastContainer } from "../../components/ui";

const initialBannedList = [
  { id: 1, name: "Robert Johnson", email: "r.johnson@email.com", reason: "Disruptive behavior", bannedDate: "Dec 15, 2025", bannedBy: "John Manager", notes: "Caused disturbance at Jazz Night event", photo: null },
  { id: 2, name: "Amanda Smith", email: "a.smith@email.com", reason: "Fraudulent tickets", bannedDate: "Dec 10, 2025", bannedBy: "Security Team", notes: "Attempted to use counterfeit tickets multiple times", photo: null },
  { id: 3, name: "Michael Brown", email: "m.brown@email.com", reason: "ID mismatch", bannedDate: "Nov 28, 2025", bannedBy: "Entry Staff", notes: "Multiple attempts with different IDs", photo: null },
];

const banReasons = [
  { value: "behavior", label: "Disruptive Behavior" },
  { value: "fraud", label: "Fraudulent Tickets" },
  { value: "id", label: "ID Mismatch" },
  { value: "violence", label: "Violence/Threats" },
  { value: "theft", label: "Theft" },
  { value: "other", label: "Other" },
];

export default function BannedList() {
  const toast = useToast();
  const [bannedList, setBannedList] = useState(initialBannedList);
  const [searchQuery, setSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editingPerson, setEditingPerson] = useState<typeof initialBannedList[0] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<typeof initialBannedList[0] | null>(null);

  const [form, setForm] = useState({
    name: "",
    email: "",
    reason: "behavior",
    notes: "",
  });

  const filteredList = bannedList.filter(person =>
    person.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    person.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const openAdd = () => {
    setEditingPerson(null);
    setForm({ name: "", email: "", reason: "behavior", notes: "" });
    setShowAddModal(true);
  };

  const openEdit = (person: typeof initialBannedList[0]) => {
    setEditingPerson(person);
    setForm({
      name: person.name,
      email: person.email,
      reason: banReasons.find(r => r.label === person.reason)?.value || "other",
      notes: person.notes,
    });
    setShowAddModal(true);
  };

  const handleSave = () => {
    const reasonLabel = banReasons.find(r => r.value === form.reason)?.label || form.reason;
    
    if (editingPerson) {
      setBannedList(bannedList.map(p =>
        p.id === editingPerson.id
          ? { ...p, name: form.name, email: form.email, reason: reasonLabel, notes: form.notes }
          : p
      ));
      toast.success("Ban record updated");
    } else {
      const newPerson = {
        id: Date.now(),
        name: form.name,
        email: form.email,
        reason: reasonLabel,
        notes: form.notes,
        bannedDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
        bannedBy: "Current User",
        photo: null,
      };
      setBannedList([newPerson, ...bannedList]);
      toast.success("Person added to banned list");
    }
    setShowAddModal(false);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setBannedList(bannedList.filter(p => p.id !== deleteTarget.id));
      toast.success("Removed from banned list");
      setShowDeleteModal(false);
    }
  };

  const getDropdownItems = (person: typeof initialBannedList[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => openEdit(person) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Remove Ban", icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => { setDeleteTarget(person); setShowDeleteModal(true); } },
  ];

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/scanning" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Banned List</h1>
            <p className="text-gray-500">Manage individuals banned from entry</p>
          </div>
        </div>
        <Button onClick={openAdd}>
          <Plus className="w-4 h-4" />
          Add to Ban List
        </Button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
          />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Person</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reason</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date Banned</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Banned By</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredList.map((person) => (
              <tr key={person.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                      <User className="w-5 h-5 text-red-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{person.name}</p>
                      <p className="text-sm text-gray-500">{person.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
                    {person.reason}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{person.bannedDate}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{person.bannedBy}</td>
                <td className="px-6 py-4 text-right">
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(person)} />
                </td>
              </tr>
            ))}
            {filteredList.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  {searchQuery ? "No matching records found" : "No one is currently banned"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={editingPerson ? "Edit Ban Record" : "Add to Ban List"}
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Enter full name"
          />
          <Input
            label="Email Address"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="Enter email"
          />
          <Select
            label="Reason for Ban"
            options={banReasons}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
          <Textarea
            label="Notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Additional details..."
            rows={3}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowAddModal(false)}>Cancel</Button>
          <Button onClick={handleSave}>{editingPerson ? "Save Changes" : "Add to Ban List"}</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Remove from Ban List"
        size="sm"
      >
        <p className="text-gray-600">
          Remove <strong>{deleteTarget?.name}</strong> from the banned list? They will be allowed entry to future events.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button onClick={handleDelete}>Remove Ban</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

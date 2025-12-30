import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, MoreVertical, Edit, Trash2, UserX, Shield, ClipboardList, Bell, UserCheck } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const initialStaffMembers = [
  { id: 1, name: "Sarah Johnson", email: "sarah@venue.com", role: "Manager", status: "active", lastActive: "2 hours ago" },
  { id: 2, name: "Mike Chen", email: "mike@venue.com", role: "Box Office", status: "active", lastActive: "1 hour ago" },
  { id: 3, name: "Emily Davis", email: "emily@venue.com", role: "Security", status: "active", lastActive: "30 min ago" },
  { id: 4, name: "Tom Wilson", email: "tom@venue.com", role: "Scanner", status: "invited", lastActive: "-" },
  { id: 5, name: "Lisa Brown", email: "lisa@venue.com", role: "VIP Host", status: "active", lastActive: "5 hours ago" },
  { id: 6, name: "Alex Martinez", email: "alex@venue.com", role: "Security", status: "inactive", lastActive: "2 weeks ago" },
];

const roleFilters = [
  { value: "all", label: "All Roles" },
  { value: "manager", label: "Manager" },
  { value: "box-office", label: "Box Office" },
  { value: "security", label: "Security" },
  { value: "scanner", label: "Scanner" },
  { value: "vip-host", label: "VIP Host" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "active": return "bg-green-100 text-green-700";
    case "invited": return "bg-yellow-100 text-yellow-700";
    case "inactive": return "bg-gray-100 text-gray-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

export default function StaffList() {
  const toast = useToast();
  const [staffMembers, setStaffMembers] = useState(initialStaffMembers);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedMember, setSelectedMember] = useState<typeof initialStaffMembers[0] | null>(null);

  const filteredStaff = staffMembers.filter(staff => {
    if (searchQuery && !staff.name.toLowerCase().includes(searchQuery.toLowerCase()) && !staff.email.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (roleFilter !== "all" && staff.role.toLowerCase().replace(" ", "-") !== roleFilter) return false;
    return true;
  });

  const handleRemove = (staff: typeof initialStaffMembers[0]) => {
    setSelectedMember(staff);
    setShowRemoveModal(true);
  };

  const confirmRemove = () => {
    if (selectedMember) {
      setStaffMembers(staffMembers.filter(s => s.id !== selectedMember.id));
      toast.success(`${selectedMember.name} has been removed from the team.`);
      setShowRemoveModal(false);
      setSelectedMember(null);
    }
  };

  const handleToggleStatus = (staff: typeof initialStaffMembers[0]) => {
    const newStatus = staff.status === "active" ? "inactive" : "active";
    setStaffMembers(staffMembers.map(s => 
      s.id === staff.id ? { ...s, status: newStatus } : s
    ));
    toast.success(`${staff.name} has been ${newStatus === "active" ? "activated" : "deactivated"}.`);
  };

  const getDropdownItems = (staff: typeof initialStaffMembers[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { label: staff.status === "active" ? "Deactivate" : "Activate", icon: <UserX className="w-4 h-4" />, onClick: () => handleToggleStatus(staff) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Remove", icon: <Trash2 className="w-4 h-4" />, onClick: () => handleRemove(staff), danger: true },
  ];

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Team</h1>
          <p className="text-gray-500">Manage your venue staff</p>
        </div>
        <Link to="/venue/team/add">
          <Button>
            <Plus className="w-4 h-4" />
            Add Staff
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Link to="/venue/team/roles" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Roles</p>
              <p className="text-sm text-gray-500">Manage permissions</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/team/assignments" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Assignments</p>
              <p className="text-sm text-gray-500">Event staffing</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/team/checkin" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <UserCheck className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Check-In</p>
              <p className="text-sm text-gray-500">Staff attendance</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/team/announcements" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Bell className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Announcements</p>
              <p className="text-sm text-gray-500">Message staff</p>
            </div>
          </div>
        </Link>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="flex items-center gap-4">
          <div className="relative flex-1">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
            />
          </div>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          >
            {roleFilters.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Active</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredStaff.map((staff) => (
              <tr key={staff.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 text-sm font-medium">
                      {staff.name.split(" ").map(n => n[0]).join("")}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{staff.name}</p>
                      <p className="text-sm text-gray-500">{staff.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{staff.role}</td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusBadge(staff.status)}`}>
                    {staff.status.charAt(0).toUpperCase() + staff.status.slice(1)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-500">{staff.lastActive}</td>
                <td className="px-6 py-4 text-right">
                  <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(staff)} />
                </td>
              </tr>
            ))}
            {filteredStaff.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No team members found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Remove Member Modal */}
      <Modal
        isOpen={showRemoveModal}
        onClose={() => setShowRemoveModal(false)}
        title="Remove Team Member"
        size="sm"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
            <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-600 font-medium">
              {selectedMember?.name.split(" ").map(n => n[0]).join("")}
            </div>
            <div>
              <p className="font-medium text-gray-900">{selectedMember?.name}</p>
              <p className="text-sm text-gray-500">{selectedMember?.email}</p>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-800 font-medium">Warning: This action cannot be undone</p>
            <p className="text-sm text-red-700 mt-1">
              This will immediately revoke their access to the venue dashboard. Any assigned tasks will need to be reassigned.
            </p>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowRemoveModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={confirmRemove}>Remove Member</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

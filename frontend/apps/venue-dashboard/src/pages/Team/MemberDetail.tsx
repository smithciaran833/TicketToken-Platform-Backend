import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Edit, Trash2, Shield, Mail, Phone, Clock, Calendar, Key } from "lucide-react";
import { Button, Modal, ModalFooter, useToast, ToastContainer } from "../../components/ui";

const member = {
  id: 1,
  name: "Sarah Wilson",
  email: "sarah@venue.com",
  phone: "+1 (555) 234-5678",
  role: "Manager",
  status: "active",
  avatar: null,
  lastLogin: "2025-01-15 2:30 PM",
  joinedDate: "2024-06-15",
  permissions: {
    dashboard: true,
    events: "full",
    financials: "view",
    settings: "view",
    team: "view",
  },
  activity: [
    { action: "Created event 'Summer Festival'", date: "2025-01-15 2:00 PM" },
    { action: "Updated ticket prices", date: "2025-01-14 11:30 AM" },
    { action: "Approved refund #1234", date: "2025-01-13 4:15 PM" },
    { action: "Added team member Mike", date: "2025-01-10 9:00 AM" },
  ],
  eventsWorked: 12,
};

export default function MemberDetail() {
  const { id } = useParams();
  const toast = useToast();
  const [showRemoveModal, setShowRemoveModal] = useState(false);

  const handleRemove = () => {
    toast.success("Team member removed");
    setShowRemoveModal(false);
  };

  const getPermissionBadge = (level: string | boolean) => {
    if (level === false) return { text: "No Access", class: "bg-gray-100 text-gray-600" };
    if (level === true) return { text: "Yes", class: "bg-green-100 text-green-700" };
    if (level === "view") return { text: "View", class: "bg-blue-100 text-blue-700" };
    if (level === "edit") return { text: "Edit", class: "bg-yellow-100 text-yellow-700" };
    if (level === "full") return { text: "Full", class: "bg-green-100 text-green-700" };
    return { text: String(level), class: "bg-gray-100 text-gray-600" };
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/team" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{member.name}</h1>
            <p className="text-gray-500">{member.role}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link to={`/venue/team/${id}/permissions`}>
            <Button variant="secondary">
              <Edit className="w-4 h-4" />
              Edit Permissions
            </Button>
          </Link>
          <Button variant="secondary" onClick={() => setShowRemoveModal(true)}>
            <Trash2 className="w-4 h-4" />
            Remove
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Profile */}
        <div className="col-span-2 space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-start gap-4">
              <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center text-2xl font-bold text-purple-600">
                {member.name.split(' ').map(n => n[0]).join('')}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-xl font-semibold text-gray-900">{member.name}</h2>
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700">
                    {member.status}
                  </span>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Mail className="w-4 h-4" />
                    {member.email}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Phone className="w-4 h-4" />
                    {member.phone}
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    <Shield className="w-4 h-4" />
                    {member.role}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Permissions Summary */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Permissions</h2>
              <Link to={`/venue/team/${id}/permissions`} className="text-sm text-purple-600 hover:text-purple-700">
                Edit →
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(member.permissions).map(([key, value]) => {
                const badge = getPermissionBadge(value);
                return (
                  <div key={key} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium text-gray-700 capitalize">{key}</span>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${badge.class}`}>
                      {badge.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Activity */}
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h2>
            <div className="space-y-4">
              {member.activity.map((item, index) => (
                <div key={index} className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-purple-500 rounded-full mt-2" />
                  <div>
                    <p className="text-gray-900">{item.action}</p>
                    <p className="text-sm text-gray-500">{item.date}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Stats</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Last Login</p>
                  <p className="font-medium text-gray-900">{member.lastLogin}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Joined</p>
                  <p className="font-medium text-gray-900">{member.joinedDate}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Key className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="text-sm text-gray-500">Events Worked</p>
                  <p className="font-medium text-gray-900">{member.eventsWorked}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Quick Actions</h3>
            <div className="space-y-2">
              <Button variant="secondary" className="w-full justify-start">
                <Mail className="w-4 h-4" />
                Send Message
              </Button>
              <Button variant="secondary" className="w-full justify-start">
                <Key className="w-4 h-4" />
                Reset Password
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Remove Modal */}
      <Modal isOpen={showRemoveModal} onClose={() => setShowRemoveModal(false)} title="Remove Team Member">
        <div className="space-y-4">
          <p className="text-gray-600">Are you sure you want to remove <strong>{member.name}</strong> from your team?</p>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-sm text-yellow-800">
              This will immediately revoke their access to your venue dashboard. Any assigned tasks or events will need to be reassigned.
            </p>
          </div>
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowRemoveModal(false)}>Cancel</Button>
          <Button onClick={handleRemove} className="bg-red-600 hover:bg-red-700">Remove Member</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

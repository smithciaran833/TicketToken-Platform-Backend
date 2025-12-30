import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Mail, Edit, Copy, Trash2, MoreVertical, Lock } from "lucide-react";
import { Button, Dropdown, useToast, ToastContainer } from "../../components/ui";

const systemTemplates = [
  { id: "order-confirm", name: "Order Confirmation", category: "Order", lastModified: "System", locked: true },
  { id: "ticket-delivery", name: "Ticket Delivery", category: "Order", lastModified: "System", locked: true },
  { id: "event-reminder", name: "Event Reminder", category: "Reminder", lastModified: "System", locked: true },
  { id: "event-canceled", name: "Event Canceled", category: "Update", lastModified: "System", locked: true },
];

const customTemplates = [
  { id: "1", name: "VIP Welcome", category: "Marketing", lastModified: "Dec 15, 2024", locked: false, active: true },
  { id: "2", name: "Season Pass Renewal", category: "Marketing", lastModified: "Dec 10, 2024", locked: false, active: true },
  { id: "3", name: "Post-Event Survey", category: "Follow-up", lastModified: "Dec 5, 2024", locked: false, active: false },
];

const categories = [
  { value: "all", label: "All Categories" },
  { value: "order", label: "Order" },
  { value: "reminder", label: "Reminder" },
  { value: "update", label: "Update" },
  { value: "marketing", label: "Marketing" },
  { value: "follow-up", label: "Follow-up" },
];

export default function CommEmailTemplates() {
  const toast = useToast();
  const [categoryFilter, setCategoryFilter] = useState("all");

  const getDropdownItems = (_template: typeof customTemplates[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { label: "Duplicate", icon: <Copy className="w-4 h-4" />, onClick: () => toast.success("Template duplicated") },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Template deleted"), danger: true },
  ];

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/settings" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Email Templates</h1>
            <p className="text-gray-500">Manage email templates</p>
          </div>
        </div>
        <Link to="/venue/settings/communication/email/new">
          <Button>
            <Plus className="w-4 h-4" />
            Create Template
          </Button>
        </Link>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
        >
          {categories.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>

      {/* System Templates */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">System Templates</h2>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {systemTemplates.map((template) => (
                <tr key={template.id}>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <Mail className="w-5 h-5 text-gray-400" />
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{template.name}</span>
                        <Lock className="w-4 h-4 text-gray-400" />
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{template.category}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                      Active
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <Button variant="secondary" size="sm">Preview</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-sm text-gray-500 mt-2">
          System templates cannot be edited but you can preview them.
        </p>
      </div>

      {/* Custom Templates */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Custom Templates</h2>
        {customTemplates.length > 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Template</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Modified</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {customTemplates.map((template) => (
                  <tr key={template.id}>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <Mail className="w-5 h-5 text-gray-400" />
                        <span className="font-medium text-gray-900">{template.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">{template.category}</td>
                    <td className="px-6 py-4 text-sm text-gray-500">{template.lastModified}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        template.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {template.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(template)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
            <Mail className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No custom templates yet.</p>
            <Link to="/venue/settings/communication/email/new">
              <Button variant="secondary" className="mt-3">Create Your First Template</Button>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

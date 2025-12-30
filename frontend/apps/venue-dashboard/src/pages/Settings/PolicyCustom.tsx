import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, FileText, Edit, Trash2, MoreVertical, Eye, EyeOff } from "lucide-react";
import { Button, Dropdown, useToast, ToastContainer } from "../../components/ui";

const customPolicies = [
  { 
    id: "1", 
    name: "Photography Policy", 
    summary: "Rules for cameras and recording devices",
    lastUpdated: "Dec 15, 2024",
    active: true 
  },
  { 
    id: "2", 
    name: "Service Animal Policy", 
    summary: "Guidelines for service and emotional support animals",
    lastUpdated: "Dec 10, 2024",
    active: true 
  },
  { 
    id: "3", 
    name: "Re-Sale Policy", 
    summary: "Rules for ticket resale and transfers",
    lastUpdated: "Nov 28, 2024",
    active: true 
  },
  { 
    id: "4", 
    name: "Weather Policy", 
    summary: "Procedures for weather-related event changes",
    lastUpdated: "Nov 15, 2024",
    active: false 
  },
];

export default function PolicyCustom() {
  const toast = useToast();
  const [policies, setPolicies] = useState(customPolicies);

  const toggleActive = (id: string) => {
    setPolicies(policies.map(p => 
      p.id === id ? { ...p, active: !p.active } : p
    ));
    toast.success("Policy updated");
  };

  const getDropdownItems = (policy: typeof customPolicies[0]) => [
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { 
      label: policy.active ? "Deactivate" : "Activate", 
      icon: policy.active ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />, 
      onClick: () => toggleActive(policy.id) 
    },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onClick: () => toast.success("Policy deleted"), danger: true },
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
            <h1 className="text-3xl font-bold text-gray-900">Custom Policies</h1>
            <p className="text-gray-500">Create additional venue policies</p>
          </div>
        </div>
        <Link to="/venue/settings/policies/custom/new">
          <Button>
            <Plus className="w-4 h-4" />
            Create Policy
          </Button>
        </Link>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Link to="/venue/settings/policies/refund" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <p className="font-medium text-gray-900">Refund Policy</p>
          <p className="text-sm text-gray-500">Manage refunds</p>
        </Link>
        <Link to="/venue/settings/policies/age" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <p className="font-medium text-gray-900">Age Policy</p>
          <p className="text-sm text-gray-500">Age restrictions</p>
        </Link>
        <Link to="/venue/settings/policies/bags" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <p className="font-medium text-gray-900">Bag Policy</p>
          <p className="text-sm text-gray-500">Bags & prohibited items</p>
        </Link>
      </div>

      {/* Custom Policies */}
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Your Custom Policies</h2>

      {policies.length > 0 ? (
        <div className="space-y-4">
          {policies.map((policy) => (
            <div 
              key={policy.id} 
              className={`bg-white rounded-lg border border-gray-200 p-6 ${!policy.active ? "opacity-60" : ""}`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-gray-900">{policy.name}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        policy.active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
                      }`}>
                        {policy.active ? "Active" : "Inactive"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{policy.summary}</p>
                    <p className="text-xs text-gray-400 mt-2">Last updated: {policy.lastUpdated}</p>
                  </div>
                </div>
                <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(policy)} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No custom policies yet.</p>
          <Link to="/venue/settings/policies/custom/new">
            <Button variant="secondary" className="mt-3">Create Your First Policy</Button>
          </Link>
        </div>
      )}
    </div>
  );
}

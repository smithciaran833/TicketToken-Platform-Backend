import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Key, Clock } from "lucide-react";
import { Button, Toggle, useToast, ToastContainer } from "../../components/ui";


const ticketTypes = [
  { value: "vip", label: "VIP Ticket" },
  { value: "premium", label: "Premium Ticket" },
  { value: "backstage", label: "Backstage Pass" },
  { value: "meet-greet", label: "Meet & Greet Package" },
  { value: "skybox", label: "Skybox Package" },
];

const staffRoles = [
  { value: "manager", label: "Manager" },
  { value: "vip-host", label: "VIP Host" },
  { value: "security", label: "Security" },
];

export default function VIPAccess() {
  const toast = useToast();

  const [accessRules, setAccessRules] = useState([
    { 
      areaId: 1, 
      areaName: "VIP Lounge", 
      ticketTypes: ["vip", "premium"], 
      guestList: true, 
      staffRoles: ["manager", "vip-host"],
      timeRestriction: false,
      startTime: "",
      endTime: ""
    },
    { 
      areaId: 2, 
      areaName: "Green Room", 
      ticketTypes: ["backstage"], 
      guestList: true, 
      staffRoles: ["manager"],
      timeRestriction: false,
      startTime: "",
      endTime: ""
    },
    { 
      areaId: 3, 
      areaName: "Skybox 1", 
      ticketTypes: ["skybox"], 
      guestList: false, 
      staffRoles: ["manager", "vip-host"],
      timeRestriction: false,
      startTime: "",
      endTime: ""
    },
    { 
      areaId: 5, 
      areaName: "Meet & Greet Room", 
      ticketTypes: ["meet-greet"], 
      guestList: false, 
      staffRoles: ["manager"],
      timeRestriction: true,
      startTime: "18:00",
      endTime: "19:00"
    },
  ]);

  const updateRule = (areaId: number, field: string, value: any) => {
    setAccessRules(accessRules.map(rule => 
      rule.areaId === areaId ? { ...rule, [field]: value } : rule
    ));
  };

  const toggleTicketType = (areaId: number, ticketType: string) => {
    setAccessRules(accessRules.map(rule => {
      if (rule.areaId !== areaId) return rule;
      const types = rule.ticketTypes.includes(ticketType)
        ? rule.ticketTypes.filter(t => t !== ticketType)
        : [...rule.ticketTypes, ticketType];
      return { ...rule, ticketTypes: types };
    }));
  };

  const toggleStaffRole = (areaId: number, role: string) => {
    setAccessRules(accessRules.map(rule => {
      if (rule.areaId !== areaId) return rule;
      const roles = rule.staffRoles.includes(role)
        ? rule.staffRoles.filter(r => r !== role)
        : [...rule.staffRoles, role];
      return { ...rule, staffRoles: roles };
    }));
  };

  const handleSave = () => {
    toast.success("Access rules saved!");
  };

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
            <h1 className="text-3xl font-bold text-gray-900">VIP Access Rules</h1>
            <p className="text-gray-500">Configure who can access each VIP area</p>
          </div>
        </div>
        <Button onClick={handleSave}>Save Changes</Button>
      </div>

      {/* Access Rules */}
      <div className="space-y-6">
        {accessRules.map((rule) => (
          <div key={rule.areaId} className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                <Key className="w-5 h-5 text-purple-600" />
              </div>
              <h2 className="text-lg font-semibold text-gray-900">{rule.areaName}</h2>
            </div>

            <div className="space-y-4">
              {/* Ticket Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Ticket Types with Access</label>
                <div className="flex flex-wrap gap-2">
                  {ticketTypes.map((type) => (
                    <label
                      key={type.value}
                      className={`px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                        rule.ticketTypes.includes(type.value)
                          ? "border-purple-500 bg-purple-50 text-purple-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={rule.ticketTypes.includes(type.value)}
                        onChange={() => toggleTicketType(rule.areaId, type.value)}
                        className="sr-only"
                      />
                      {type.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Guest List */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Guest List Access</p>
                  <p className="text-sm text-gray-500">Allow guest list entries to access this area</p>
                </div>
                <Toggle
                  enabled={rule.guestList}
                  onChange={(val) => updateRule(rule.areaId, "guestList", val)}
                />
              </div>

              {/* Staff Roles */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Staff Roles with Access</label>
                <div className="flex flex-wrap gap-2">
                  {staffRoles.map((role) => (
                    <label
                      key={role.value}
                      className={`px-3 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                        rule.staffRoles.includes(role.value)
                          ? "border-blue-500 bg-blue-50 text-blue-700"
                          : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={rule.staffRoles.includes(role.value)}
                        onChange={() => toggleStaffRole(rule.areaId, role.value)}
                        className="sr-only"
                      />
                      {role.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Time Restriction */}
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">Time Restriction</p>
                  <p className="text-sm text-gray-500">Limit access to specific hours</p>
                </div>
                <Toggle
                  enabled={rule.timeRestriction}
                  onChange={(val) => updateRule(rule.areaId, "timeRestriction", val)}
                />
              </div>

              {rule.timeRestriction && (
                <div className="flex items-center gap-4 pl-4">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-gray-400" />
                    <input
                      type="time"
                      value={rule.startTime}
                      onChange={(e) => updateRule(rule.areaId, "startTime", e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <span className="text-gray-500">to</span>
                  <input
                    type="time"
                    value={rule.endTime}
                    onChange={(e) => updateRule(rule.areaId, "endTime", e.target.value)}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

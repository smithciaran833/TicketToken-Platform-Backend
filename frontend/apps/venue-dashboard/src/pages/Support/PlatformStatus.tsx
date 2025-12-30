import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, Clock, RefreshCw } from "lucide-react";

const services = [
  { name: "Web Platform", status: "operational", uptime: "99.99%" },
  { name: "API", status: "operational", uptime: "99.98%" },
  { name: "Scanner App", status: "operational", uptime: "99.95%" },
  { name: "Payment Processing", status: "operational", uptime: "99.99%" },
  { name: "Email Delivery", status: "degraded", uptime: "98.50%" },
  { name: "Analytics", status: "operational", uptime: "99.90%" },
];

const incidents = [
  { date: "Jan 15, 2025", title: "Email delays", status: "investigating", description: "Some users may experience delayed email delivery. We are investigating." },
  { date: "Jan 10, 2025", title: "Scanner app connectivity", status: "resolved", description: "Resolved: Scanner app connectivity issues in certain regions." },
  { date: "Jan 5, 2025", title: "Scheduled maintenance completed", status: "resolved", description: "All systems have been updated successfully." },
];

const statusConfig = {
  operational: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100", label: "Operational" },
  degraded: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-100", label: "Degraded" },
  outage: { icon: XCircle, color: "text-red-600", bg: "bg-red-100", label: "Outage" },
  investigating: { icon: Clock, color: "text-yellow-600", bg: "bg-yellow-100", label: "Investigating" },
  resolved: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100", label: "Resolved" },
};

export default function PlatformStatus() {
  const allOperational = services.every(s => s.status === "operational");

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/support" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Platform Status</h1>
            <p className="text-gray-500">Current system status and incidents</p>
          </div>
        </div>
        <button className="flex items-center gap-2 text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" />
          <span className="text-sm">Refresh</span>
        </button>
      </div>

      {/* Overall Status */}
      <div className={`rounded-lg p-6 mb-6 ${allOperational ? "bg-green-50 border border-green-200" : "bg-yellow-50 border border-yellow-200"}`}>
        <div className="flex items-center gap-3">
          {allOperational ? (
            <CheckCircle className="w-8 h-8 text-green-600" />
          ) : (
            <AlertTriangle className="w-8 h-8 text-yellow-600" />
          )}
          <div>
            <h2 className={`text-lg font-semibold ${allOperational ? "text-green-800" : "text-yellow-800"}`}>
              {allOperational ? "All Systems Operational" : "Some Systems Degraded"}
            </h2>
            <p className={`text-sm ${allOperational ? "text-green-700" : "text-yellow-700"}`}>
              Last updated: {new Date().toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Services */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Services</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {services.map((service) => {
            const config = statusConfig[service.status as keyof typeof statusConfig];
            const Icon = config.icon;
            return (
              <div key={service.name} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${config.color}`} />
                  <span className="font-medium text-gray-900">{service.name}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-500">{service.uptime} uptime</span>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bg} ${config.color}`}>
                    {config.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Incidents */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Recent Incidents</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {incidents.map((incident, index) => {
            const config = statusConfig[incident.status as keyof typeof statusConfig];
            return (
              <div key={index} className="px-6 py-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">{incident.title}</span>
                    <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${config.bg} ${config.color}`}>
                      {config.label}
                    </span>
                  </div>
                  <span className="text-sm text-gray-500">{incident.date}</span>
                </div>
                <p className="text-sm text-gray-600">{incident.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Subscribe */}
      <div className="mt-6 text-center">
        <Link to="/venue/support/subscribe" className="text-purple-600 hover:text-purple-700 font-medium">
          Subscribe to status updates →
        </Link>
      </div>
    </div>
  );
}

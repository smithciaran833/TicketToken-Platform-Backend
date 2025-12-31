import { useNavigate } from "react-router-dom";
import { ArrowLeft, CheckCircle } from "lucide-react";

const mockAppInfo = {
  version: "2.4.1",
  build: "2410124",
  environment: "Production",
  lastUpdated: "December 28, 2024",
  isLatest: true,
};

export default function AppVersion() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">App Info</h1>
        </div>
      </header>

      <div className="px-5 py-6 space-y-6">
        {/* Logo & Version */}
        <div className="flex flex-col items-center py-8">
          <div className="w-20 h-20 bg-purple-600 rounded-2xl flex items-center justify-center mb-4">
            <span className="text-3xl font-bold text-white">T</span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">TicketToken</h2>
          <p className="text-gray-500">Version {mockAppInfo.version}</p>

          {mockAppInfo.isLatest && (
            <div className="flex items-center gap-2 mt-4 px-4 py-2 bg-green-50 rounded-full">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700 font-medium">Up to date</span>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="bg-white rounded-xl shadow-sm divide-y divide-gray-100">
          <div className="flex justify-between px-5 py-4">
            <span className="text-gray-500">Version</span>
            <span className="font-medium text-gray-900">{mockAppInfo.version}</span>
          </div>
          <div className="flex justify-between px-5 py-4">
            <span className="text-gray-500">Build</span>
            <span className="font-medium text-gray-900">{mockAppInfo.build}</span>
          </div>
          <div className="flex justify-between px-5 py-4">
            <span className="text-gray-500">Environment</span>
            <span className="font-medium text-gray-900">{mockAppInfo.environment}</span>
          </div>
          <div className="flex justify-between px-5 py-4">
            <span className="text-gray-500">Last Updated</span>
            <span className="font-medium text-gray-900">{mockAppInfo.lastUpdated}</span>
          </div>
        </div>

        {/* Actions */}
        <button className="w-full py-3 bg-white text-gray-700 font-medium rounded-xl shadow-sm hover:bg-gray-50 transition-colors">
          Check for Updates
        </button>

        {/* Footer */}
        <p className="text-sm text-gray-400 text-center">
          © 2025 TicketToken, Inc. All rights reserved.
        </p>
      </div>
    </div>
  );
}

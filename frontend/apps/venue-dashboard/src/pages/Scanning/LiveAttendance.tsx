import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, Users, TrendingUp, Clock } from "lucide-react";
import { Button } from "../../components/ui";

const mockData = {
  eventName: "Summer Music Festival",
  checkedIn: 834,
  totalTickets: 1432,
  checkInRate: 12, // per minute
  byTicketType: [
    { type: "General Admission", checkedIn: 612, total: 1000, color: "bg-blue-500" },
    { type: "VIP Access", checkedIn: 145, total: 200, color: "bg-purple-500" },
    { type: "Early Bird", checkedIn: 77, total: 232, color: "bg-green-500" },
  ],
  byEntryPoint: [
    { name: "Main Gate", checkedIn: 512, devices: 3 },
    { name: "VIP Entrance", checkedIn: 245, devices: 2 },
    { name: "Will Call", checkedIn: 77, devices: 1 },
  ],
  recentCheckIns: [
    { name: "John Smith", type: "General Admission", time: "Just now", entry: "Main Gate" },
    { name: "Sarah Johnson", type: "VIP Access", time: "30s ago", entry: "VIP Entrance" },
    { name: "Mike Chen", type: "General Admission", time: "1m ago", entry: "Main Gate" },
    { name: "Emily Davis", type: "Early Bird", time: "1m ago", entry: "Will Call" },
    { name: "Alex Wilson", type: "General Admission", time: "2m ago", entry: "Main Gate" },
  ],
  checkInsOverTime: [
    { time: "5:00 PM", count: 0 },
    { time: "5:15 PM", count: 45 },
    { time: "5:30 PM", count: 156 },
    { time: "5:45 PM", count: 287 },
    { time: "6:00 PM", count: 423 },
    { time: "6:15 PM", count: 589 },
    { time: "6:30 PM", count: 712 },
    { time: "6:45 PM", count: 834 },
  ],
};

export default function LiveAttendance() {
  const [_searchParams] = useSearchParams();
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastRefresh(new Date());
      setIsRefreshing(false);
    }, 500);
  };

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const percentCheckedIn = Math.round((mockData.checkedIn / mockData.totalTickets) * 100);
  const maxChartValue = Math.max(...mockData.checkInsOverTime.map(d => d.count));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/scanning" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold text-gray-900">Live Attendance</h1>
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full animate-pulse">● Live</span>
            </div>
            <p className="text-gray-500">{mockData.eventName}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </span>
          <Button variant="secondary" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Checked In</p>
              <p className="text-3xl font-bold text-gray-900">{mockData.checkedIn.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">of {mockData.totalTickets.toLocaleString()} total</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Progress</p>
              <p className="text-3xl font-bold text-purple-600">{percentCheckedIn}%</p>
            </div>
          </div>
          <div className="w-full h-2 bg-gray-200 rounded-full mt-3">
            <div className="h-2 bg-purple-600 rounded-full" style={{ width: `${percentCheckedIn}%` }} />
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Check-in Rate</p>
              <p className="text-3xl font-bold text-green-600">{mockData.checkInRate}</p>
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">per minute</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Remaining</p>
              <p className="text-3xl font-bold text-gray-900">{(mockData.totalTickets - mockData.checkedIn).toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
              <Clock className="w-6 h-6 text-gray-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">tickets not checked in</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Check-ins Over Time Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Check-ins Over Time</h2>
          <div className="h-48 flex items-end justify-between gap-2">
            {mockData.checkInsOverTime.map((point, index) => (
              <div key={index} className="flex-1 flex flex-col items-center">
                <div 
                  className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                  style={{ height: `${(point.count / maxChartValue) * 160}px` }}
                />
                <span className="text-xs text-gray-500 mt-2 rotate-45 origin-left">{point.time}</span>
              </div>
            ))}
          </div>
        </div>

        {/* By Ticket Type */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">By Ticket Type</h2>
          <div className="space-y-4">
            {mockData.byTicketType.map((type, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{type.type}</span>
                  <span className="text-sm text-gray-600">{type.checkedIn} / {type.total}</span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full">
                  <div 
                    className={`h-3 rounded-full ${type.color}`}
                    style={{ width: `${(type.checkedIn / type.total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* By Entry Point */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">By Entry Point</h2>
          <div className="space-y-3">
            {mockData.byEntryPoint.map((point, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{point.name}</p>
                  <p className="text-sm text-gray-500">{point.devices} active device{point.devices !== 1 ? "s" : ""}</p>
                </div>
                <p className="text-2xl font-bold text-purple-600">{point.checkedIn}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Check-ins Feed */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Check-ins</h2>
          <div className="space-y-3">
            {mockData.recentCheckIns.map((checkIn, index) => (
              <div key={index} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <div>
                    <p className="font-medium text-gray-900">{checkIn.name}</p>
                    <p className="text-xs text-gray-500">{checkIn.type} • {checkIn.entry}</p>
                  </div>
                </div>
                <span className="text-sm text-gray-500">{checkIn.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

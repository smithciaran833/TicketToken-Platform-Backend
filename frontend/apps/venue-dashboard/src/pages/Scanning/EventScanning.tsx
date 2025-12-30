import { useState, useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, Users, TrendingUp, History, Smartphone } from "lucide-react";
import { Button } from "../../components/ui";

const mockEvents: Record<number, any> = {
  1: {
    id: 1,
    name: "Summer Music Festival",
    date: "Today",
    time: "6:00 PM",
    doorsOpen: "5:00 PM",
    venue: "Main Stage",
    status: "live",
  },
  5: {
    id: 5,
    name: "Jazz Night",
    date: "Today", 
    time: "8:00 PM",
    doorsOpen: "7:30 PM",
    venue: "The Blue Room",
    status: "upcoming",
  },
  2: {
    id: 2,
    name: "Tech Conference",
    date: "Tomorrow",
    time: "9:00 AM",
    doorsOpen: "8:00 AM",
    venue: "Convention Center",
    status: "upcoming",
  },
  6: {
    id: 6,
    name: "Comedy Night",
    date: "Dec 20",
    time: "9:00 PM",
    doorsOpen: "8:00 PM",
    venue: "The Laugh Factory",
    status: "past",
  },
};

const getMockData = (eventId: number) => ({
  checkedIn: eventId === 1 ? 834 : eventId === 6 ? 312 : 0,
  totalTickets: eventId === 1 ? 1432 : eventId === 5 ? 245 : eventId === 6 ? 312 : 856,
  checkInRate: eventId === 1 ? 12 : 0,
  activeDevices: eventId === 1 ? 6 : 0,
  byTicketType: [
    { type: "General Admission", checkedIn: eventId === 1 ? 612 : 0, total: 1000, color: "bg-blue-500" },
    { type: "VIP Access", checkedIn: eventId === 1 ? 145 : 0, total: 200, color: "bg-purple-500" },
    { type: "Early Bird", checkedIn: eventId === 1 ? 77 : 0, total: 232, color: "bg-green-500" },
  ],
  byEntryPoint: [
    { name: "Main Gate", checkedIn: eventId === 1 ? 512 : 0, devices: eventId === 1 ? 3 : 0 },
    { name: "VIP Entrance", checkedIn: eventId === 1 ? 245 : 0, devices: eventId === 1 ? 2 : 0 },
    { name: "Will Call", checkedIn: eventId === 1 ? 77 : 0, devices: eventId === 1 ? 1 : 0 },
  ],
  recentCheckIns: eventId === 1 ? [
    { name: "John Smith", type: "General Admission", time: "Just now", entry: "Main Gate" },
    { name: "Sarah Johnson", type: "VIP Access", time: "30s ago", entry: "VIP Entrance" },
    { name: "Mike Chen", type: "General Admission", time: "1m ago", entry: "Main Gate" },
    { name: "Emily Davis", type: "Early Bird", time: "1m ago", entry: "Will Call" },
    { name: "Alex Wilson", type: "General Admission", time: "2m ago", entry: "Main Gate" },
  ] : [],
  checkInsOverTime: eventId === 1 ? [
    { time: "5:00 PM", count: 0 },
    { time: "5:15 PM", count: 45 },
    { time: "5:30 PM", count: 156 },
    { time: "5:45 PM", count: 287 },
    { time: "6:00 PM", count: 423 },
    { time: "6:15 PM", count: 589 },
    { time: "6:30 PM", count: 712 },
    { time: "6:45 PM", count: 834 },
  ] : [],
});

export default function EventScanning() {
  const { id } = useParams();
  const eventId = parseInt(id || "1");
  const event = mockEvents[eventId];
  const data = getMockData(eventId);

  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setLastRefresh(new Date());
      setIsRefreshing(false);
    }, 500);
  };

  useEffect(() => {
    if (event?.status === "live") {
      const interval = setInterval(() => {
        setLastRefresh(new Date());
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [event?.status]);

  if (!event) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Event not found</p>
        <Link to="/venue/scanning" className="text-purple-600 hover:text-purple-700 mt-2 inline-block">
          Back to Scanning
        </Link>
      </div>
    );
  }

  const percentCheckedIn = Math.round((data.checkedIn / data.totalTickets) * 100);
  const maxChartValue = Math.max(...data.checkInsOverTime.map(d => d.count), 1);

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
              <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
              {event.status === "live" && (
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full animate-pulse">● Live</span>
              )}
            </div>
            <p className="text-gray-500">{event.date} • {event.venue}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {event.status === "live" && (
            <span className="text-sm text-gray-500">
              Updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
          <Button variant="secondary" onClick={handleRefresh} disabled={isRefreshing}>
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Link to={`/venue/scanning/event/${eventId}/history`}>
            <Button variant="secondary">
              <History className="w-4 h-4" />
              Scan History
            </Button>
          </Link>
        </div>
      </div>

      {/* Main Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Checked In</p>
              <p className="text-3xl font-bold text-gray-900">{data.checkedIn.toLocaleString()}</p>
            </div>
            <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">of {data.totalTickets.toLocaleString()} total</p>
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
              <p className="text-3xl font-bold text-green-600">{data.checkInRate}</p>
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
              <p className="text-sm text-gray-500">Active Scanners</p>
              <p className="text-3xl font-bold text-blue-600">{data.activeDevices}</p>
            </div>
            <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Smartphone className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">devices online</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* Check-ins Over Time Chart */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Check-ins Over Time</h2>
          {data.checkInsOverTime.length > 0 ? (
            <div className="h-48 flex items-end justify-between gap-2">
              {data.checkInsOverTime.map((point, index) => (
                <div key={index} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-purple-500 rounded-t transition-all hover:bg-purple-600"
                    style={{ height: `${(point.count / maxChartValue) * 160}px` }}
                  />
                  <span className="text-xs text-gray-500 mt-2">{point.time.split(" ")[0]}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-48 flex items-center justify-center text-gray-500">
              No check-in data yet
            </div>
          )}
        </div>

        {/* By Ticket Type */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">By Ticket Type</h2>
          <div className="space-y-4">
            {data.byTicketType.map((type, index) => (
              <div key={index}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">{type.type}</span>
                  <span className="text-sm text-gray-600">{type.checkedIn} / {type.total}</span>
                </div>
                <div className="w-full h-3 bg-gray-200 rounded-full">
                  <div 
                    className={`h-3 rounded-full ${type.color}`}
                    style={{ width: `${type.total > 0 ? (type.checkedIn / type.total) * 100 : 0}%` }}
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
            {data.byEntryPoint.map((point, index) => (
              <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{point.name}</p>
                  <p className="text-sm text-gray-500">
                    {point.devices > 0 ? (
                      <span className="text-green-600">{point.devices} device{point.devices !== 1 ? "s" : ""} active</span>
                    ) : (
                      <span className="text-gray-400">No devices</span>
                    )}
                  </p>
                </div>
                <p className="text-2xl font-bold text-purple-600">{point.checkedIn}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Check-ins Feed */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Recent Check-ins</h2>
          {data.recentCheckIns.length > 0 ? (
            <div className="space-y-3">
              {data.recentCheckIns.map((checkIn, index) => (
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
          ) : (
            <div className="text-center py-8 text-gray-500">
              No check-ins yet
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

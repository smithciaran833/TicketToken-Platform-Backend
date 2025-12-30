import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Clock, Users, ChevronRight, Settings, History, MapPin, AlertTriangle, Smartphone, Calendar } from "lucide-react";
import { Button } from "../../components/ui";

const allEvents = [
  { 
    id: 1, 
    name: "Summer Music Festival", 
    date: "Today",
    dateSort: 0,
    time: "6:00 PM",
    doorsOpen: "5:00 PM",
    venue: "Main Stage",
    checkedIn: 834,
    totalTickets: 1432,
    activeDevices: 6,
    entryPoints: [
      { name: "Main Gate", checkedIn: 612, devices: 3 },
      { name: "VIP Entrance", checkedIn: 145, devices: 2 },
      { name: "Will Call", checkedIn: 77, devices: 1 },
    ],
    status: "live"
  },
  { 
    id: 5, 
    name: "Jazz Night", 
    date: "Today",
    dateSort: 0,
    time: "8:00 PM",
    doorsOpen: "7:30 PM",
    venue: "The Blue Room",
    checkedIn: 0,
    totalTickets: 245,
    activeDevices: 0,
    entryPoints: [
      { name: "Front Door", checkedIn: 0, devices: 0 },
    ],
    status: "upcoming"
  },
  { 
    id: 2, 
    name: "Tech Conference", 
    date: "Tomorrow",
    dateSort: 1,
    time: "9:00 AM",
    doorsOpen: "8:00 AM",
    venue: "Convention Center",
    checkedIn: 0,
    totalTickets: 856,
    activeDevices: 0,
    entryPoints: [
      { name: "Main Lobby", checkedIn: 0, devices: 0 },
      { name: "Side Entrance", checkedIn: 0, devices: 0 },
    ],
    status: "upcoming"
  },
  { 
    id: 4, 
    name: "Art Gallery Opening", 
    date: "Sep 5",
    dateSort: 7,
    time: "7:00 PM",
    doorsOpen: "6:30 PM",
    venue: "Downtown Gallery",
    checkedIn: 0,
    totalTickets: 175,
    activeDevices: 0,
    entryPoints: [
      { name: "Gallery Entrance", checkedIn: 0, devices: 0 },
    ],
    status: "upcoming"
  },
  { 
    id: 6, 
    name: "Comedy Night", 
    date: "Dec 20",
    dateSort: -9,
    time: "9:00 PM",
    doorsOpen: "8:00 PM",
    venue: "The Laugh Factory",
    checkedIn: 312,
    totalTickets: 312,
    activeDevices: 0,
    entryPoints: [
      { name: "Front Door", checkedIn: 312, devices: 0 },
    ],
    status: "past"
  },
];

const tabs = [
  { id: "today", label: "Today" },
  { id: "upcoming", label: "Upcoming" },
  { id: "past", label: "Past Events" },
];

function getStatusBadge(status: string) {
  switch (status) {
    case "live":
      return <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full animate-pulse">● Live</span>;
    case "upcoming":
      return <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-700 rounded-full">Upcoming</span>;
    case "past":
      return <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">Completed</span>;
    default:
      return null;
  }
}

export default function ScannerHome() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("today");

  const todayEvents = allEvents.filter(e => e.dateSort === 0);
  const upcomingEvents = allEvents.filter(e => e.dateSort > 0);
  const pastEvents = allEvents.filter(e => e.dateSort < 0);

  const getFilteredEvents = () => {
    switch (activeTab) {
      case "today": return todayEvents;
      case "upcoming": return upcomingEvents;
      case "past": return pastEvents;
      default: return todayEvents;
    }
  };

  const filteredEvents = getFilteredEvents();

  // Stats for today
  const totalCheckedInToday = todayEvents.reduce((sum, e) => sum + e.checkedIn, 0);
  const totalTicketsToday = todayEvents.reduce((sum, e) => sum + e.totalTickets, 0);
  const activeDevicesTotal = todayEvents.reduce((sum, e) => sum + e.activeDevices, 0);
  const liveEventsCount = todayEvents.filter(e => e.status === "live").length;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Ticket Scanning</h1>
          <p className="text-gray-500">Select an event to view check-in data</p>
        </div>
        <Link to="/venue/scanning/settings">
          <Button variant="secondary">
            <Settings className="w-4 h-4" />
            Scanner Settings
          </Button>
        </Link>
      </div>

      {/* Today's Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Live Events</p>
          <p className="text-2xl font-bold text-green-600">{liveEventsCount}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Checked In Today</p>
          <p className="text-2xl font-bold text-purple-600">{totalCheckedInToday.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Total Tickets Today</p>
          <p className="text-2xl font-bold text-gray-900">{totalTicketsToday.toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm text-gray-500">Active Scanners</p>
          <p className="text-2xl font-bold text-blue-600">{activeDevicesTotal}</p>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <Link to="/venue/scanning/history" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
              <History className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Scan History</p>
              <p className="text-sm text-gray-500">All events</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/scanning/zones" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <MapPin className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Zone Occupancy</p>
              <p className="text-sm text-gray-500">Live capacity</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/scanning/alerts" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <AlertTriangle className="w-5 h-5 text-yellow-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Capacity Alerts</p>
              <p className="text-sm text-gray-500">Manage alerts</p>
            </div>
          </div>
        </Link>

        <Link to="/venue/scanning/banned" className="bg-white rounded-lg border border-gray-200 p-4 hover:border-purple-300 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
              <Users className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">Banned List</p>
              <p className="text-sm text-gray-500">Restrictions</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? "border-purple-600 text-purple-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.label}
            {tab.id === "today" && todayEvents.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-purple-100 text-purple-700 rounded-full">
                {todayEvents.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Events List */}
      <div className="space-y-4">
        {filteredEvents.map((event) => (
          <div 
            key={event.id} 
            className="bg-white rounded-lg border border-gray-200 p-6 hover:border-purple-300 transition-colors cursor-pointer"
            onClick={() => navigate(`/venue/scanning/event/${event.id}`)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="text-xl font-semibold text-gray-900">{event.name}</h3>
                  {getStatusBadge(event.status)}
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-4 h-4" />
                    {event.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" />
                    Doors: {event.doorsOpen} • Event: {event.time}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {event.venue}
                  </span>
                  {event.activeDevices > 0 && (
                    <span className="flex items-center gap-1 text-green-600">
                      <Smartphone className="w-4 h-4" />
                      {event.activeDevices} scanner{event.activeDevices !== 1 ? "s" : ""} active
                    </span>
                  )}
                </div>
                
                {/* Check-in Progress */}
                <div>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-600">Check-in Progress</span>
                    <span className="font-medium">{event.checkedIn.toLocaleString()} / {event.totalTickets.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-200 rounded-full">
                    <div 
                      className={`h-2 rounded-full transition-all ${event.status === "live" ? "bg-green-500" : "bg-purple-600"}`}
                      style={{ width: `${(event.checkedIn / event.totalTickets) * 100}%` }}
                    />
                  </div>
                </div>
              </div>

              <ChevronRight className="w-6 h-6 text-gray-400 ml-4" />
            </div>
          </div>
        ))}

        {filteredEvents.length === 0 && (
          <div className="bg-gray-50 rounded-lg border border-gray-200 p-12 text-center">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Events</h3>
            <p className="text-gray-500">
              {activeTab === "today" && "No events scheduled for today."}
              {activeTab === "upcoming" && "No upcoming events."}
              {activeTab === "past" && "No past events to show."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

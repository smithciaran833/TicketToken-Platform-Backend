import { Link } from "react-router-dom";
import { Plus, Building2, MapPin, Calendar, MoreVertical, BarChart3, Settings, Power } from "lucide-react";
import { Button, Dropdown } from "../../components/ui";

const venues = [
  { 
    id: 1, 
    name: "The Grand Theater", 
    location: "Downtown, New York", 
    status: "active",
    eventsCount: 24,
    totalRevenue: 485000,
    ticketsSold: 12500,
    image: null
  },
  { 
    id: 2, 
    name: "Riverside Amphitheater", 
    location: "Brooklyn, New York", 
    status: "active",
    eventsCount: 18,
    totalRevenue: 320000,
    ticketsSold: 8900,
    image: null
  },
  { 
    id: 3, 
    name: "The Jazz Lounge", 
    location: "Manhattan, New York", 
    status: "setup",
    eventsCount: 0,
    totalRevenue: 0,
    ticketsSold: 0,
    image: null
  },
];

export default function VenuesList() {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active": return "bg-green-100 text-green-700";
      case "setup": return "bg-yellow-100 text-yellow-700";
      case "inactive": return "bg-gray-100 text-gray-700";
      default: return "bg-gray-100 text-gray-700";
    }
  };

  const getDropdownItems = (_venue: typeof venues[0]) => [
    { label: "Switch to Venue", icon: <Power className="w-4 h-4" />, onClick: () => {} },
    { label: "Edit Settings", icon: <Settings className="w-4 h-4" />, onClick: () => {} },
    { label: "View Analytics", icon: <BarChart3 className="w-4 h-4" />, onClick: () => {} },
    { divider: true, label: "", onClick: () => {} },
    { label: "Deactivate", icon: <Power className="w-4 h-4" />, onClick: () => {}, danger: true },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Your Venues</h1>
          <p className="text-gray-500">Manage all your venues in one place</p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/venues/compare">
            <Button variant="secondary">
              <BarChart3 className="w-4 h-4" />
              Compare Venues
            </Button>
          </Link>
          <Link to="/venues/new">
            <Button>
              <Plus className="w-4 h-4" />
              Add Venue
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total Venues</p>
          <p className="text-3xl font-bold text-gray-900">{venues.length}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total Events</p>
          <p className="text-3xl font-bold text-gray-900">{venues.reduce((sum, v) => sum + v.eventsCount, 0)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total Revenue</p>
          <p className="text-3xl font-bold text-gray-900">${(venues.reduce((sum, v) => sum + v.totalRevenue, 0) / 1000).toFixed(0)}k</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <p className="text-sm text-gray-500">Total Tickets Sold</p>
          <p className="text-3xl font-bold text-gray-900">{venues.reduce((sum, v) => sum + v.ticketsSold, 0).toLocaleString()}</p>
        </div>
      </div>

      {/* Cross-Venue Analytics Link */}
      <Link to="/venues/analytics" className="block mb-6">
        <div className="bg-gradient-to-r from-purple-600 to-purple-800 rounded-lg p-6 text-white hover:from-purple-700 hover:to-purple-900 transition-colors">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Cross-Venue Analytics</h3>
              <p className="text-purple-200">View combined analytics across all your venues</p>
            </div>
            <BarChart3 className="w-8 h-8 text-purple-200" />
          </div>
        </div>
      </Link>

      {/* Venues Grid */}
      <div className="grid grid-cols-3 gap-6">
        {venues.map((venue) => (
          <div key={venue.id} className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow">
            {/* Venue Image */}
            <div className="h-32 bg-gradient-to-br from-purple-500 to-purple-700 flex items-center justify-center">
              <Building2 className="w-12 h-12 text-white/50" />
            </div>

            {/* Venue Info */}
            <div className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold text-gray-900">{venue.name}</h3>
                  <div className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="w-3 h-3" />
                    {venue.location}
                  </div>
                </div>
                <Dropdown 
                  trigger={<MoreVertical className="w-5 h-5 text-gray-400" />} 
                  items={getDropdownItems(venue)} 
                />
              </div>

              <div className="flex items-center gap-2 mb-4">
                <span className={`px-2 py-1 text-xs font-medium rounded-full capitalize ${getStatusBadge(venue.status)}`}>
                  {venue.status}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center border-t border-gray-100 pt-4">
                <div>
                  <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                    <Calendar className="w-3 h-3" />
                  </div>
                  <p className="text-lg font-semibold text-gray-900">{venue.eventsCount}</p>
                  <p className="text-xs text-gray-500">Events</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">${(venue.totalRevenue / 1000).toFixed(0)}k</p>
                  <p className="text-xs text-gray-500">Revenue</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-gray-900">{(venue.ticketsSold / 1000).toFixed(1)}k</p>
                  <p className="text-xs text-gray-500">Tickets</p>
                </div>
              </div>

              <button className="w-full mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium">
                Switch to Venue
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

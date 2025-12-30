import { useState } from "react";
import { ArrowLeft, Monitor, Tablet, Smartphone, Edit, Calendar, Clock, MapPin, Ticket } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Button, useToast, ToastContainer } from "../components/ui";

const eventData = {
  name: "Summer Music Festival",
  date: "August 15, 2025",
  time: "6:00 PM",
  doors: "5:00 PM",
  venue: "The Grand Hall",
  address: "123 Main St, New York, NY 10001",
  image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=800&h=400&fit=crop",
  description: "Join us for the biggest music festival of the summer featuring top artists from around the world. Experience three stages of live music, food vendors, and an unforgettable atmosphere.",
  tickets: [
    { name: "General Admission", price: 65, available: true },
    { name: "VIP Access", price: 150, available: true },
    { name: "Early Bird", price: 50, available: false },
  ],
  status: "draft",
};

const devices = [
  { id: "desktop", icon: Monitor, label: "Desktop", width: "100%" },
  { id: "tablet", icon: Tablet, label: "Tablet", width: "768px" },
  { id: "mobile", icon: Smartphone, label: "Mobile", width: "375px" },
];

export default function EventPreview() {
  const { id } = useParams();
  const toast = useToast();
  const [device, setDevice] = useState("desktop");

  const currentDevice = devices.find(d => d.id === device);

  const handlePublish = () => {
    toast.success("Event published successfully!");
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <p className="text-sm text-gray-500">Preview</p>
            <h1 className="font-semibold text-gray-900">{eventData.name}</h1>
          </div>
        </div>

        {/* Device Toggle */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {devices.map((d) => (
            <button
              key={d.id}
              onClick={() => setDevice(d.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                device === d.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <d.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{d.label}</span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link to={`/venue/events/${id}/edit`}>
            <Button variant="secondary">
              <Edit className="w-4 h-4" />
              <span>Edit Event</span>
            </Button>
          </Link>
          {eventData.status === "draft" && (
            <Button onClick={handlePublish}>Publish Event</Button>
          )}
        </div>
      </div>

      {/* Preview Container */}
      <div className="pt-20 pb-8 px-8 flex justify-center">
        <div 
          className="bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-300"
          style={{ 
            width: currentDevice?.width,
            maxWidth: "100%",
          }}
        >
          {/* Fan-facing Event Page Preview */}
          <div className="relative">
            {/* Hero Image */}
            <img 
              src={eventData.image} 
              alt={eventData.name}
              className="w-full h-64 object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <h1 className={`font-bold ${device === 'mobile' ? 'text-2xl' : 'text-3xl'}`}>
                {eventData.name}
              </h1>
            </div>
          </div>

          {/* Event Info */}
          <div className={`p-6 ${device === 'mobile' ? 'p-4' : ''}`}>
            {/* Date/Time/Location */}
            <div className={`grid gap-4 mb-6 ${device === 'mobile' ? 'grid-cols-1' : 'grid-cols-3'}`}>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Calendar className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Date</p>
                  <p className="font-medium text-gray-900">{eventData.date}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <Clock className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Time</p>
                  <p className="font-medium text-gray-900">{eventData.time}</p>
                  <p className="text-xs text-gray-400">Doors: {eventData.doors}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <MapPin className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Location</p>
                  <p className="font-medium text-gray-900">{eventData.venue}</p>
                  <p className="text-xs text-gray-400">{eventData.address}</p>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="mb-6">
              <h2 className="font-semibold text-gray-900 mb-2">About This Event</h2>
              <p className="text-gray-600">{eventData.description}</p>
            </div>

            {/* Tickets */}
            <div className="border-t border-gray-200 pt-6">
              <h2 className="font-semibold text-gray-900 mb-4">
                <Ticket className="w-5 h-5 inline mr-2" />
                Tickets
              </h2>
              <div className="space-y-3">
                {eventData.tickets.map((ticket) => (
                  <div 
                    key={ticket.name}
                    className={`flex items-center justify-between p-4 border rounded-lg ${
                      ticket.available 
                        ? 'border-gray-200 hover:border-purple-300' 
                        : 'border-gray-200 bg-gray-50 opacity-60'
                    }`}
                  >
                    <div>
                      <p className="font-medium text-gray-900">{ticket.name}</p>
                      <p className="text-sm text-gray-500">
                        {ticket.available ? 'Available' : 'Sold Out'}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <p className="font-bold text-gray-900">${ticket.price}</p>
                      <button 
                        className={`px-4 py-2 rounded-lg font-medium ${
                          ticket.available
                            ? 'bg-purple-600 text-white hover:bg-purple-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                        disabled={!ticket.available}
                      >
                        {ticket.available ? 'Select' : 'Sold Out'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Venue Info */}
            <div className="border-t border-gray-200 pt-6 mt-6">
              <h2 className="font-semibold text-gray-900 mb-4">Venue</h2>
              <div className="bg-gray-100 rounded-lg h-48 flex items-center justify-center text-gray-400">
                Map would display here
              </div>
              <p className="mt-2 text-gray-700 font-medium">{eventData.venue}</p>
              <p className="text-gray-500">{eventData.address}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

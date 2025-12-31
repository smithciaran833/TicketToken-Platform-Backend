import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, List, Navigation, Calendar, MapPin, X } from "lucide-react";

interface EventPin {
  id: string;
  title: string;
  date: string;
  venue: string;
  price: number;
  image: string;
  lat: number;
  lng: number;
}

const mockPins: EventPin[] = [
  { id: "1", title: "Japanese Breakfast", date: "Sat, Jul 15", venue: "The Fillmore", price: 45, image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&q=80", lat: 37.784, lng: -122.433 },
  { id: "2", title: "Khruangbin", date: "Thu, Aug 3", venue: "The Greek Theatre", price: 65, image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&q=80", lat: 37.874, lng: -122.254 },
  { id: "3", title: "Turnstile", date: "Fri, Aug 18", venue: "The Warfield", price: 40, image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=300&q=80", lat: 37.783, lng: -122.410 },
  { id: "4", title: "Caroline Polachek", date: "Sat, Sep 2", venue: "The Fox Theater", price: 55, image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=300&q=80", lat: 37.805, lng: -122.270 },
];

export default function MapView() {
  const navigate = useNavigate();
  const [selectedEvent, setSelectedEvent] = useState<EventPin | null>(null);

  // Note: In production, you'd use a real map library like react-map-gl, google-maps-react, or leaflet
  // This is a placeholder UI demonstrating the layout

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Header */}
      <header className="bg-white px-5 py-4 shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <Link
            to="/search"
            className="flex-1 flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-2.5"
          >
            <Search className="w-5 h-5 text-gray-400" />
            <span className="text-gray-500">Search events...</span>
          </Link>
          <Link
            to="/search/results"
            className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <List className="w-5 h-5 text-gray-600" />
          </Link>
        </div>
      </header>

      {/* Map Placeholder */}
      <div className="flex-1 relative">
        {/* Fake map background */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-100 to-green-100">
          <div className="absolute inset-0 opacity-20">
            {/* Grid lines to simulate map */}
            <svg className="w-full h-full">
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="gray" strokeWidth="0.5" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#grid)" />
            </svg>
          </div>
        </div>

        {/* Event Pins */}
        {mockPins.map((pin, index) => (
          <button
            key={pin.id}
            onClick={() => setSelectedEvent(pin)}
            className={`absolute transform -translate-x-1/2 -translate-y-full transition-all ${
              selectedEvent?.id === pin.id ? "z-20 scale-110" : "z-10"
            }`}
            style={{
              left: `${20 + index * 20}%`,
              top: `${30 + (index % 2) * 30}%`,
            }}
          >
            <div
              className={`px-3 py-1.5 rounded-full font-semibold text-sm shadow-lg ${
                selectedEvent?.id === pin.id
                  ? "bg-purple-600 text-white"
                  : "bg-white text-gray-900"
              }`}
            >
              ${pin.price}
            </div>
            <div
              className={`w-3 h-3 rotate-45 mx-auto -mt-1.5 ${
                selectedEvent?.id === pin.id ? "bg-purple-600" : "bg-white"
              }`}
            />
          </button>
        ))}

        {/* Current Location Button */}
        <button className="absolute bottom-28 right-4 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center hover:bg-gray-50 transition-colors">
          <Navigation className="w-5 h-5 text-purple-600" />
        </button>

        {/* Selected Event Card */}
        {selectedEvent && (
          <div className="absolute bottom-4 left-4 right-4 bg-white rounded-2xl shadow-xl overflow-hidden">
            <button
              onClick={() => setSelectedEvent(null)}
              className="absolute top-3 right-3 p-1 bg-gray-100 rounded-full z-10"
            >
              <X className="w-4 h-4 text-gray-600" />
            </button>
            <Link to={`/event/${selectedEvent.id}`} className="flex gap-4 p-4">
              <img
                src={selectedEvent.image}
                alt={selectedEvent.title}
                className="w-20 h-20 object-cover rounded-xl"
              />
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900">{selectedEvent.title}</h3>
                <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{selectedEvent.date}</span>
                </div>
                <div className="flex items-center gap-1 text-sm text-gray-500">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>{selectedEvent.venue}</span>
                </div>
                <p className="text-purple-600 font-semibold mt-1">
                  From ${selectedEvent.price}
                </p>
              </div>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

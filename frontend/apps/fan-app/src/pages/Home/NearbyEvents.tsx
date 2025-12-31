import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Map } from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";

const nearbyEvents = [
  {
    id: "1",
    title: "Japanese Breakfast",
    subtitle: "Jubilee Tour 2025",
    date: "Sat, Jul 15",
    time: "8:00 PM",
    venue: "The Fillmore",
    city: "San Francisco",
    price: 45,
    distance: 1.2,
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80",
  },
  {
    id: "3",
    title: "Turnstile",
    date: "Fri, Aug 18",
    time: "7:00 PM",
    venue: "The Warfield",
    city: "San Francisco",
    price: 40,
    distance: 1.8,
    image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&q=80",
  },
  {
    id: "2",
    title: "Khruangbin",
    subtitle: "A La Sala Tour",
    date: "Thu, Aug 3",
    time: "7:30 PM",
    venue: "The Greek Theatre",
    city: "Berkeley",
    price: 65,
    distance: 4.5,
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&q=80",
  },
  {
    id: "4",
    title: "Caroline Polachek",
    subtitle: "Spiraling Tour",
    date: "Sat, Sep 2",
    time: "8:00 PM",
    venue: "The Fox Theater",
    city: "Oakland",
    price: 55,
    distance: 6.2,
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=80",
  },
];

const distanceFilters = [
  { label: "5 mi", value: 5 },
  { label: "10 mi", value: 10 },
  { label: "25 mi", value: 25 },
  { label: "50 mi", value: 50 },
];

export default function NearbyEvents() {
  const [selectedDistance, setSelectedDistance] = useState(25);

  const filteredEvents = nearbyEvents.filter(
    (event) => event.distance <= selectedDistance
  );

  return (
    <AppLayout>
      <div className="min-h-screen bg-white">
        {/* Header */}
        <header className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 py-4 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="p-1 -ml-1">
                <ArrowLeft className="w-6 h-6 text-gray-900" />
              </Link>
              <h1 className="text-xl font-bold text-gray-900">Nearby Events</h1>
            </div>
            <Link
              to="/search/map"
              className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
            >
              <Map className="w-5 h-5 text-gray-600" />
            </Link>
          </div>

          {/* Distance Filter */}
          <div className="flex gap-2 mt-4">
            {distanceFilters.map((filter) => (
              <button
                key={filter.value}
                onClick={() => setSelectedDistance(filter.value)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  selectedDistance === filter.value
                    ? "bg-gray-900 text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </header>

        {/* Events List */}
        <div className="px-5 py-6">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-12">
              <MapPin className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                No events nearby
              </h3>
              <p className="text-gray-500">
                Try increasing the distance or check back later
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredEvents.map((event) => (
                <Link
                  key={event.id}
                  to={`/event/${event.id}`}
                  className="block bg-white rounded-2xl overflow-hidden shadow-sm border border-gray-100 transition-all hover:shadow-md hover:border-gray-200 active:scale-[0.99]"
                >
                  <div className="aspect-[2/1] w-full relative">
                    <img
                      src={event.image}
                      alt={event.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-3 left-3">
                      <span className="px-2.5 py-1 bg-white/95 backdrop-blur-sm rounded-full text-xs font-semibold text-gray-700">
                        {event.distance} mi away
                      </span>
                    </div>
                    <div className="absolute bottom-3 left-3">
                      <span className="px-3 py-1.5 bg-white/95 backdrop-blur-sm rounded-full text-sm font-semibold text-gray-900 shadow-sm">
                        From ${event.price}
                      </span>
                    </div>
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-lg text-gray-900">
                      {event.title}
                    </h3>
                    {event.subtitle && (
                      <p className="text-gray-500">{event.subtitle}</p>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {event.date} · {event.time}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                      <MapPin className="w-4 h-4" />
                      <span>
                        {event.venue}, {event.city}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}

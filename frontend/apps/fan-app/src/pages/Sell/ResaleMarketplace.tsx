import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Search, SlidersHorizontal, Calendar, MapPin, Tag } from "lucide-react";

interface ResaleEvent {
  id: string;
  title: string;
  date: string;
  venue: string;
  city: string;
  ticketsAvailable: number;
  priceRange: { min: number; max: number };
  image: string;
}

const mockResaleEvents: ResaleEvent[] = [
  {
    id: "1",
    title: "Japanese Breakfast",
    date: "Sat, Jul 15",
    venue: "The Fillmore",
    city: "San Francisco",
    ticketsAvailable: 8,
    priceRange: { min: 45, max: 85 },
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
  },
  {
    id: "5",
    title: "Tyler, The Creator",
    date: "Fri, Sep 22",
    venue: "Chase Center",
    city: "San Francisco",
    ticketsAvailable: 24,
    priceRange: { min: 120, max: 350 },
    image: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=400&q=80",
  },
  {
    id: "6",
    title: "Billie Eilish",
    date: "Sat, Oct 7",
    venue: "Oracle Park",
    city: "San Francisco",
    ticketsAvailable: 56,
    priceRange: { min: 95, max: 450 },
    image: "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=400&q=80",
  },
];

export default function ResaleMarketplace() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEvents = mockResaleEvents.filter((event) =>
    event.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <div className="flex-1 flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-2.5">
            <Search className="w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search resale tickets..."
              className="flex-1 bg-transparent outline-none text-gray-900 placeholder-gray-400"
            />
          </div>
          <button className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors">
            <SlidersHorizontal className="w-5 h-5 text-gray-600" />
          </button>
        </div>
      </header>

      <div className="px-5 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Resale Tickets</h2>
          <span className="text-sm text-gray-500">{filteredEvents.length} events</span>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Tag className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No resale tickets found</h3>
            <p className="text-gray-500">Try a different search term</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredEvents.map((event) => (
              <Link
                key={event.id}
                to={`/event/${event.id}?tab=resale`}
                className="block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex gap-4 p-4">
                  <img
                    src={event.image}
                    alt={event.title}
                    className="w-24 h-24 object-cover rounded-xl"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{event.title}</h3>
                    <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{event.date}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-gray-500">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{event.venue}, {event.city}</span>
                    </div>

                    <div className="flex items-center justify-between mt-3">
                      <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                        {event.ticketsAvailable} available
                      </span>
                      <span className="text-purple-600 font-semibold">
                        ${event.priceRange.min} - ${event.priceRange.max}
                      </span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

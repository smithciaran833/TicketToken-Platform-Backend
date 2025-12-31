import { Link } from "react-router-dom";
import { Search, Calendar, MapPin } from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";

const events = [
  {
    id: "1",
    title: "Japanese Breakfast",
    subtitle: "Jubilee Tour 2025",
    date: "Sat, Jul 15",
    time: "8:00 PM",
    venue: "The Fillmore",
    city: "San Francisco",
    price: 45,
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=600&q=80",
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
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=600&q=80",
  },
  {
    id: "3",
    title: "Turnstile",
    date: "Fri, Aug 18",
    time: "7:00 PM",
    venue: "The Warfield",
    city: "San Francisco",
    price: 40,
    image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=600&q=80",
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
    image: "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=600&q=80",
  },
];

export default function HomePage() {
  return (
    <AppLayout>
      <div className="min-h-screen bg-white">
        {/* Header */}
        <header className="px-5 pt-6 pb-4">
          <div className="flex items-center justify-between mb-5">
            <h1 className="text-2xl font-bold text-gray-900">TicketToken</h1>
          </div>
          
          {/* Search Bar */}
          <Link
            to="/search"
            className="flex items-center gap-3 bg-gray-100 rounded-xl px-4 py-3 transition-colors hover:bg-gray-200"
          >
            <Search className="w-5 h-5 text-gray-400" />
            <span className="text-gray-500">Search events...</span>
          </Link>
        </header>

        {/* Events List */}
        <div className="px-5 pb-8">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
            Upcoming Events
          </h2>
          
          <div className="space-y-4">
            {events.map((event) => (
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
                  <div className="absolute bottom-3 left-3">
                    <span className="px-3 py-1.5 bg-white/95 backdrop-blur-sm rounded-full text-sm font-semibold text-gray-900 shadow-sm">
                      From ${event.price}
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold text-lg text-gray-900">{event.title}</h3>
                  {event.subtitle && (
                    <p className="text-gray-500">{event.subtitle}</p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-sm text-gray-500">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4" />
                      <span>{event.date} · {event.time}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500">
                    <MapPin className="w-4 h-4" />
                    <span>{event.venue}, {event.city}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

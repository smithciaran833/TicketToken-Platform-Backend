import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin } from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";

const featuredEvents = [
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
    featured: true,
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
    featured: true,
  },
  {
    id: "5",
    title: "Tyler, The Creator",
    subtitle: "Chromakopia World Tour",
    date: "Fri, Sep 22",
    time: "7:00 PM",
    venue: "Chase Center",
    city: "San Francisco",
    price: 125,
    image: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=600&q=80",
    featured: true,
  },
  {
    id: "6",
    title: "Billie Eilish",
    subtitle: "Hit Me Hard and Soft Tour",
    date: "Sat, Oct 7",
    time: "8:00 PM",
    venue: "Oracle Park",
    city: "San Francisco",
    price: 150,
    image: "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=600&q=80",
    featured: true,
  },
];

export default function FeaturedEvents() {
  return (
    <AppLayout>
      <div className="min-h-screen bg-white">
        {/* Header */}
        <header className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 py-4 z-10">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </Link>
            <h1 className="text-xl font-bold text-gray-900">Featured Events</h1>
          </div>
        </header>

        {/* Events List */}
        <div className="px-5 py-6">
          <div className="space-y-4">
            {featuredEvents.map((event) => (
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
                    <span className="px-2.5 py-1 bg-purple-600 rounded-full text-xs font-semibold text-white">
                      Featured
                    </span>
                  </div>
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

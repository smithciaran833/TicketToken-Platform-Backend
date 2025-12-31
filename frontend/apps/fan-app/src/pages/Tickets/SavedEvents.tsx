import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Heart, Calendar, MapPin } from "lucide-react";

interface SavedEvent {
  id: string;
  title: string;
  date: string;
  venue: string;
  city: string;
  price: number;
  image: string;
}

const mockSavedEvents: SavedEvent[] = [
  {
    id: "1",
    title: "Japanese Breakfast",
    date: "Sat, Jul 15",
    venue: "The Fillmore",
    city: "San Francisco",
    price: 45,
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
  },
  {
    id: "2",
    title: "Khruangbin",
    date: "Thu, Aug 3",
    venue: "The Greek Theatre",
    city: "Berkeley",
    price: 65,
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&q=80",
  },
  {
    id: "3",
    title: "Tyler, The Creator",
    date: "Fri, Sep 22",
    venue: "Chase Center",
    city: "San Francisco",
    price: 125,
    image: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=400&q=80",
  },
];

export default function SavedEvents() {
  const navigate = useNavigate();
  const [savedEvents, setSavedEvents] = useState(mockSavedEvents);

  const removeEvent = (eventId: string) => {
    setSavedEvents((prev) => prev.filter((e) => e.id !== eventId));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Saved Events</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        {savedEvents.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Heart className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No saved events</h2>
            <p className="text-gray-500 mb-6">Events you save will appear here</p>
            <Link
              to="/"
              className="inline-block px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
            >
              Browse Events
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {savedEvents.map((event) => (
              <div
                key={event.id}
                className="bg-white rounded-2xl overflow-hidden shadow-sm"
              >
                <Link to={`/event/${event.id}`} className="flex gap-4 p-4">
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
                    <p className="text-purple-600 font-semibold mt-2">From ${event.price}</p>
                  </div>
                </Link>
                <div className="px-4 pb-4">
                  <button
                    onClick={() => removeEvent(event.id)}
                    className="flex items-center gap-2 text-sm text-red-600 hover:text-red-700"
                  >
                    <Heart className="w-4 h-4 fill-red-600" />
                    Remove from Saved
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

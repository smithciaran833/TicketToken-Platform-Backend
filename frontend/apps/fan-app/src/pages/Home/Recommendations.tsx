import { Link } from "react-router-dom";
import { ArrowLeft, Calendar, MapPin, Sparkles } from "lucide-react";
import AppLayout from "../../components/layout/AppLayout";

const recommendations = [
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
    reason: "Based on your interest in Indie Rock",
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
    reason: "You follow this artist",
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
    reason: "Similar to artists you like",
  },
  {
    id: "7",
    title: "Tame Impala",
    date: "Sun, Oct 15",
    time: "7:00 PM",
    venue: "Shoreline Amphitheatre",
    city: "Mountain View",
    price: 85,
    image: "https://images.unsplash.com/photo-1506157786151-b8491531f063?w=600&q=80",
    reason: "Popular with fans of Khruangbin",
  },
];

// Mock auth state - replace with real auth context
const isLoggedIn = true;

export default function Recommendations() {
  if (!isLoggedIn) {
    return (
      <AppLayout>
        <div className="min-h-screen bg-white">
          <header className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 py-4 z-10">
            <div className="flex items-center gap-4">
              <Link to="/" className="p-1 -ml-1">
                <ArrowLeft className="w-6 h-6 text-gray-900" />
              </Link>
              <h1 className="text-xl font-bold text-gray-900">For You</h1>
            </div>
          </header>

          <div className="flex flex-col items-center justify-center px-5 py-20">
            <Sparkles className="w-16 h-16 text-gray-300 mb-6" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Get Personalized Picks
            </h2>
            <p className="text-gray-500 text-center mb-6 max-w-xs">
              Sign in to see events recommended based on your interests and history
            </p>
            <Link
              to="/signup"
              className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
            >
              Create Account
            </Link>
            <Link
              to="/login"
              className="mt-3 text-purple-600 font-medium hover:underline"
            >
              Already have an account? Log in
            </Link>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-white">
        {/* Header */}
        <header className="sticky top-0 bg-white/95 backdrop-blur-sm border-b border-gray-100 px-5 py-4 z-10">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900">For You</h1>
              <p className="text-sm text-gray-500">Based on your interests</p>
            </div>
          </div>
        </header>

        {/* Events List */}
        <div className="px-5 py-6">
          <div className="space-y-4">
            {recommendations.map((event) => (
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
                  <div className="flex items-center gap-1.5 text-purple-600 text-sm font-medium mb-1">
                    <Sparkles className="w-4 h-4" />
                    <span>{event.reason}</span>
                  </div>
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
        </div>
      </div>
    </AppLayout>
  );
}

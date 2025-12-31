import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Clock, CheckCircle, XCircle, Calendar, MapPin, AlertCircle } from "lucide-react";

interface WaitlistEntry {
  id: string;
  event: {
    id: string;
    title: string;
    date: string;
    venue: string;
    image: string;
  };
  ticketType: string;
  position: number;
  dateJoined: string;
  status: "waiting" | "offer" | "expired";
  offerExpiresAt?: string;
}

const mockWaitlist: WaitlistEntry[] = [
  {
    id: "1",
    event: {
      id: "1",
      title: "Japanese Breakfast",
      date: "Sat, Jul 15",
      venue: "The Fillmore",
      image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
    },
    ticketType: "General Admission",
    position: 12,
    dateJoined: "Jul 1, 2025",
    status: "offer",
    offerExpiresAt: "23:45:00",
  },
  {
    id: "2",
    event: {
      id: "5",
      title: "Tyler, The Creator",
      date: "Fri, Sep 22",
      venue: "Chase Center",
      image: "https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=400&q=80",
    },
    ticketType: "Floor",
    position: 45,
    dateJoined: "Jun 28, 2025",
    status: "waiting",
  },
  {
    id: "3",
    event: {
      id: "6",
      title: "Billie Eilish",
      date: "Sat, Oct 7",
      venue: "Oracle Park",
      image: "https://images.unsplash.com/photo-1429962714451-bb934ecdc4ec?w=400&q=80",
    },
    ticketType: "VIP",
    position: 0,
    dateJoined: "Jun 15, 2025",
    status: "expired",
  },
];

const statusConfig = {
  waiting: { icon: Clock, color: "text-amber-600", bg: "bg-amber-100", label: "Waiting" },
  offer: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100", label: "Offer Available" },
  expired: { icon: XCircle, color: "text-gray-500", bg: "bg-gray-100", label: "Expired" },
};

export default function WaitlistStatus() {
  const navigate = useNavigate();
  const [waitlist, setWaitlist] = useState(mockWaitlist);

  const leaveWaitlist = (entryId: string) => {
    if (confirm("Are you sure you want to leave this waitlist?")) {
      setWaitlist((prev) => prev.filter((e) => e.id !== entryId));
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Waitlists</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        {waitlist.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Clock className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No waitlists</h2>
            <p className="text-gray-500">Join a waitlist when an event is sold out</p>
          </div>
        ) : (
          <div className="space-y-4">
            {waitlist.map((entry) => {
              const status = statusConfig[entry.status];
              const StatusIcon = status.icon;

              return (
                <div
                  key={entry.id}
                  className={`bg-white rounded-2xl overflow-hidden shadow-sm ${
                    entry.status === "expired" ? "opacity-60" : ""
                  }`}
                >
                  {/* Offer Banner */}
                  {entry.status === "offer" && (
                    <div className="bg-green-600 text-white px-4 py-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Tickets available!</span>
                      </div>
                      <span className="text-sm font-mono">Expires in {entry.offerExpiresAt}</span>
                    </div>
                  )}

                  <div className="p-4">
                    <Link to={`/event/${entry.event.id}`} className="flex gap-4">
                      <img
                        src={entry.event.image}
                        alt={entry.event.title}
                        className="w-20 h-20 object-cover rounded-xl"
                      />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900">{entry.event.title}</h3>
                        <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{entry.event.date}</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm text-gray-500">
                          <MapPin className="w-3.5 h-3.5" />
                          <span>{entry.event.venue}</span>
                        </div>
                      </div>
                    </Link>

                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-sm text-gray-500">{entry.ticketType}</p>
                          {entry.status === "waiting" && (
                            <p className="text-sm font-medium text-gray-900">
                              Position #{entry.position}
                            </p>
                          )}
                        </div>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${status.bg}`}>
                          <StatusIcon className={`w-4 h-4 ${status.color}`} />
                          <span className={`text-sm font-medium ${status.color}`}>
                            {status.label}
                          </span>
                        </div>
                      </div>

                      {entry.status === "offer" ? (
                        <Link
                          to={`/event/${entry.event.id}/checkout`}
                          className="block w-full py-3 bg-green-600 text-white text-center font-semibold rounded-xl hover:bg-green-700 transition-colors"
                        >
                          Complete Purchase
                        </Link>
                      ) : entry.status === "waiting" ? (
                        <button
                          onClick={() => leaveWaitlist(entry.id)}
                          className="w-full py-3 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200 transition-colors"
                        >
                          Leave Waitlist
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

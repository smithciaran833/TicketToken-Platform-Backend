import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, QrCode, ChevronRight } from "lucide-react";
import { Tabs } from "../../components/ui";

interface UpcomingTicket {
  id: number;
  eventName: string;
  date: string;
  time: string;
  venue: string;
  ticketCount: number;
  daysUntil: number;
  image: string;
}

interface PastTicket {
  id: number;
  eventName: string;
  date: string;
  venue: string;
  ticketCount: number;
  image: string;
}

const upcomingTickets: UpcomingTicket[] = [
  { 
    id: 1, 
    eventName: "Summer Music Festival 2025", 
    date: "Jul 15, 2025", 
    time: "4:00 PM",
    venue: "Central Park",
    ticketCount: 2,
    daysUntil: 15,
    image: "https://images.unsplash.com/photo-1459749411175-04bf5292ceea?w=400"
  },
  { 
    id: 2, 
    eventName: "Jazz Night Live", 
    date: "Jun 28, 2025", 
    time: "8:00 PM",
    venue: "Blue Note",
    ticketCount: 1,
    daysUntil: 3,
    image: "https://images.unsplash.com/photo-1415201364774-f6f0bb35f28f?w=400"
  },
];

const pastTickets: PastTicket[] = [
  { 
    id: 3, 
    eventName: "Comedy Night", 
    date: "May 20, 2025", 
    venue: "Comedy Cellar",
    ticketCount: 2,
    image: "https://images.unsplash.com/photo-1585699324551-f6322a8a19f7?w=400"
  },
];

export default function TicketList() {
  const [activeTab, setActiveTab] = useState("upcoming");

  const tabs = [
    { id: "upcoming", label: "Upcoming", count: upcomingTickets.length },
    { id: "past", label: "Past", count: pastTickets.length },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white px-4 py-4 border-b border-gray-100">
        <h1 className="text-2xl font-bold text-gray-900">My Tickets</h1>
      </header>

      {/* Tabs */}
      <div className="bg-white px-4">
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      </div>

      {/* Ticket List */}
      <div className="p-4 space-y-3">
        {activeTab === "upcoming" ? (
          upcomingTickets.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <QrCode className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 mb-4">No upcoming tickets</p>
              <Link to="/" className="text-purple-600 font-medium">Browse Events</Link>
            </div>
          ) : (
            upcomingTickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/tickets/${ticket.id}`}
                className="flex gap-4 bg-white rounded-xl p-4 shadow-sm"
              >
                <img 
                  src={ticket.image} 
                  alt={ticket.eventName}
                  className="w-20 h-20 rounded-lg object-cover"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{ticket.eventName}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                        <Calendar className="w-4 h-4" />
                        <span>{ticket.date}</span>
                        <span>• {ticket.time}</span>
                      </div>
                      <p className="text-sm text-gray-500">{ticket.venue}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                      {ticket.ticketCount} ticket{ticket.ticketCount !== 1 ? "s" : ""}
                    </span>
                    {ticket.daysUntil <= 7 && (
                      <span className="px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded-full">
                        {ticket.daysUntil} day{ticket.daysUntil !== 1 ? "s" : ""} away
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))
          )
        ) : (
          pastTickets.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <QrCode className="w-8 h-8 text-gray-400" />
              </div>
              <p className="text-gray-500 mb-4">No past tickets</p>
              <Link to="/" className="text-purple-600 font-medium">Browse Events</Link>
            </div>
          ) : (
            pastTickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/tickets/${ticket.id}`}
                className="flex gap-4 bg-white rounded-xl p-4 shadow-sm"
              >
                <img 
                  src={ticket.image} 
                  alt={ticket.eventName}
                  className="w-20 h-20 rounded-lg object-cover"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-gray-900 truncate">{ticket.eventName}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                        <Calendar className="w-4 h-4" />
                        <span>{ticket.date}</span>
                      </div>
                      <p className="text-sm text-gray-500">{ticket.venue}</p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                      {ticket.ticketCount} ticket{ticket.ticketCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              </Link>
            ))
          )
        )}
      </div>
    </div>
  );
}

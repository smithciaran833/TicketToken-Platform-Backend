import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CreditCard, Ticket, ChevronRight } from "lucide-react";

interface SellableTicket {
  id: string;
  eventTitle: string;
  date: string;
  ticketType: string;
  section?: string;
  image: string;
}

const mockTickets: SellableTicket[] = [
  {
    id: "1",
    eventTitle: "Japanese Breakfast",
    date: "Sat, Jul 15",
    ticketType: "General Admission",
    section: "Floor",
    image: "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=400&q=80",
  },
  {
    id: "2",
    eventTitle: "Khruangbin",
    date: "Thu, Aug 3",
    ticketType: "Reserved Seating",
    section: "Section 102, Row G",
    image: "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=400&q=80",
  },
];

// Mock: Check if Stripe is connected
const hasStripeConnected = true;

export default function ListTicket() {
  const navigate = useNavigate();

  if (!hasStripeConnected) {
    return (
      <div className="min-h-screen bg-white">
        <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-1 -ml-1">
              <ArrowLeft className="w-6 h-6 text-gray-900" />
            </button>
            <h1 className="text-xl font-bold text-gray-900">Sell a Ticket</h1>
          </div>
        </header>

        <div className="px-5 py-12 text-center">
          <div className="w-20 h-20 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <CreditCard className="w-10 h-10 text-purple-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Set Up Payouts First</h2>
          <p className="text-gray-500 mb-6 max-w-xs mx-auto">
            Connect your bank account to receive payouts when your tickets sell.
          </p>
          <Link
            to="/sell/setup"
            className="inline-block px-6 py-3 bg-purple-600 text-white font-semibold rounded-xl hover:bg-purple-700 transition-colors"
          >
            Set Up Payouts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Sell a Ticket</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        <p className="text-gray-500 mb-6">Select a ticket to list for sale</p>

        {mockTickets.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No sellable tickets</h2>
            <p className="text-gray-500">You don't have any tickets available to sell</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mockTickets.map((ticket) => (
              <Link
                key={ticket.id}
                to={`/sell/new/${ticket.id}/price`}
                className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <img
                  src={ticket.image}
                  alt={ticket.eventTitle}
                  className="w-16 h-16 object-cover rounded-lg"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{ticket.eventTitle}</h3>
                  <p className="text-sm text-gray-500">{ticket.date}</p>
                  <p className="text-sm text-purple-600">{ticket.ticketType}</p>
                  {ticket.section && (
                    <p className="text-sm text-gray-500">{ticket.section}</p>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-gray-400" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

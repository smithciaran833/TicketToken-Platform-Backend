import { useNavigate } from "react-router-dom";
import { ArrowLeft, Send, Download, Clock, CheckCircle, XCircle } from "lucide-react";

interface Transfer {
  id: string;
  eventTitle: string;
  ticketType: string;
  direction: "sent" | "received";
  recipient?: string;
  sender?: string;
  date: string;
  status: "completed" | "pending" | "cancelled";
}

const mockTransfers: Transfer[] = [
  {
    id: "1",
    eventTitle: "Japanese Breakfast",
    ticketType: "General Admission",
    direction: "sent",
    recipient: "jane@example.com",
    date: "Jul 10, 2025",
    status: "completed",
  },
  {
    id: "2",
    eventTitle: "Khruangbin",
    ticketType: "VIP",
    direction: "received",
    sender: "mike@example.com",
    date: "Jul 8, 2025",
    status: "completed",
  },
  {
    id: "3",
    eventTitle: "Turnstile",
    ticketType: "General Admission",
    direction: "sent",
    recipient: "alex@example.com",
    date: "Jul 5, 2025",
    status: "pending",
  },
  {
    id: "4",
    eventTitle: "Caroline Polachek",
    ticketType: "Floor",
    direction: "sent",
    recipient: "sam@example.com",
    date: "Jun 28, 2025",
    status: "cancelled",
  },
];

const statusConfig = {
  completed: { icon: CheckCircle, color: "text-green-600", bg: "bg-green-100", label: "Completed" },
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-100", label: "Pending" },
  cancelled: { icon: XCircle, color: "text-red-600", bg: "bg-red-100", label: "Cancelled" },
};

export default function TransferHistory() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="p-1 -ml-1">
            <ArrowLeft className="w-6 h-6 text-gray-900" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Transfer History</h1>
        </div>
      </header>

      <div className="px-5 py-6">
        {mockTransfers.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Send className="w-8 h-8 text-gray-400" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-1">No transfers yet</h2>
            <p className="text-gray-500">Your ticket transfer history will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {mockTransfers.map((transfer) => {
              const status = statusConfig[transfer.status];
              const StatusIcon = status.icon;

              return (
                <div
                  key={transfer.id}
                  className="bg-white rounded-xl p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          transfer.direction === "sent" ? "bg-purple-100" : "bg-green-100"
                        }`}
                      >
                        {transfer.direction === "sent" ? (
                          <Send className="w-4 h-4 text-purple-600" />
                        ) : (
                          <Download className="w-4 h-4 text-green-600" />
                        )}
                      </div>
                      <span className="text-sm font-medium text-gray-600">
                        {transfer.direction === "sent" ? "Sent" : "Received"}
                      </span>
                    </div>
                    <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full ${status.bg}`}>
                      <StatusIcon className={`w-3.5 h-3.5 ${status.color}`} />
                      <span className={`text-xs font-medium ${status.color}`}>{status.label}</span>
                    </div>
                  </div>

                  <h3 className="font-semibold text-gray-900">{transfer.eventTitle}</h3>
                  <p className="text-sm text-gray-500">{transfer.ticketType}</p>

                  <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
                    <p className="text-sm text-gray-500">
                      {transfer.direction === "sent" ? "To: " : "From: "}
                      <span className="text-gray-700">
                        {transfer.direction === "sent" ? transfer.recipient : transfer.sender}
                      </span>
                    </p>
                    <p className="text-sm text-gray-400">{transfer.date}</p>
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

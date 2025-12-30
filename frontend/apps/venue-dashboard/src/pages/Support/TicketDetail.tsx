import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle, AlertCircle, Send, Paperclip } from "lucide-react";
import { Button, useToast, ToastContainer } from "../../components/ui";

const ticket = {
  id: "TKT-1234",
  subject: "Payment not processing",
  status: "open",
  priority: "high",
  created: "January 15, 2025 at 2:30 PM",
  category: "Billing & Payments",
  messages: [
    { id: 1, sender: "user", name: "John Doe", content: "I'm trying to process a refund for order #5678 but the system keeps showing an error. I've tried multiple times and cleared my cache.", timestamp: "Jan 15, 2:30 PM" },
    { id: 2, sender: "agent", name: "Sarah (Support)", content: "Hi John, I'm sorry to hear you're having trouble. Let me look into this for you. Can you tell me what error message you're seeing?", timestamp: "Jan 15, 2:45 PM" },
    { id: 3, sender: "user", name: "John Doe", content: "It says 'Transaction failed - please try again' but doesn't give any specific reason.", timestamp: "Jan 15, 3:00 PM" },
    { id: 4, sender: "agent", name: "Sarah (Support)", content: "Thank you for that information. I can see there was a temporary issue with our payment processor. This has been resolved now. Could you please try the refund again?", timestamp: "Jan 15, 3:30 PM" },
  ],
};

export default function TicketDetail() {
  const { id: _id } = useParams();
  const toast = useToast();
  const [reply, setReply] = useState("");

  const handleSendReply = () => {
    if (!reply.trim()) return;
    toast.success("Reply sent!");
    setReply("");
  };

  const handleCloseTicket = () => {
    toast.success("Ticket marked as resolved");
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/support/tickets" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{ticket.subject}</h1>
              <span className="px-2 py-1 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Open
              </span>
            </div>
            <p className="text-gray-500">{ticket.id} • Opened {ticket.created}</p>
          </div>
        </div>
        <Button variant="secondary" onClick={handleCloseTicket}>
          <CheckCircle className="w-4 h-4" />
          Mark Resolved
        </Button>
      </div>

      <div className="grid grid-cols-4 gap-6">
        {/* Messages */}
        <div className="col-span-3 space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="divide-y divide-gray-200">
              {ticket.messages.map((message) => (
                <div key={message.id} className={`p-4 ${message.sender === "agent" ? "bg-purple-50" : ""}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                        message.sender === "agent" 
                          ? "bg-purple-600 text-white"
                          : "bg-gray-200 text-gray-600"
                      }`}>
                        {message.name.charAt(0)}
                      </div>
                      <span className="font-medium text-gray-900">{message.name}</span>
                    </div>
                    <span className="text-sm text-gray-500">{message.timestamp}</span>
                  </div>
                  <p className="text-gray-700 ml-10">{message.content}</p>
                </div>
              ))}
            </div>

            {/* Reply Box */}
            <div className="border-t border-gray-200 p-4">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Type your reply..."
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 resize-none"
                rows={3}
              />
              <div className="flex items-center justify-between mt-3">
                <button className="flex items-center gap-1 text-gray-500 hover:text-gray-700">
                  <Paperclip className="w-4 h-4" />
                  <span className="text-sm">Attach file</span>
                </button>
                <Button onClick={handleSendReply}>
                  <Send className="w-4 h-4" />
                  Send Reply
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <h3 className="font-semibold text-gray-900 mb-3">Ticket Details</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-gray-500">Status</dt>
                <dd className="font-medium text-gray-900 capitalize">{ticket.status}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Priority</dt>
                <dd className="font-medium text-red-600 capitalize">{ticket.priority}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Category</dt>
                <dd className="font-medium text-gray-900">{ticket.category}</dd>
              </div>
              <div>
                <dt className="text-gray-500">Created</dt>
                <dd className="font-medium text-gray-900">{ticket.created}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-sm text-gray-600">
              Need immediate help? <Link to="/venue/support/chat" className="text-purple-600 hover:text-purple-700">Start a live chat</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

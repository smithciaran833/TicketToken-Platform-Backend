import { useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Upload, Clock } from "lucide-react";
import { Button, Textarea, useToast, ToastContainer } from "../../components/ui";

const mockChargeback = {
  id: "CHB-001",
  orderId: "ORD-2001",
  amount: 150,
  reason: "Fraudulent",
  deadline: "Jul 15, 2025",
  daysLeft: 16,
  date: "Jun 25, 2025",
  customer: { name: "Unknown", email: "unknown@email.com" },
  event: { name: "Tech Conference", date: "Sep 15, 2025" },
  transaction: {
    id: "TXN-2001",
    date: "Jun 20, 2025",
    items: [{ name: "Premium Pass", quantity: 1, price: 150 }],
  },
};

const evidenceItems = [
  { id: "order", label: "Order Confirmation", description: "Proof of purchase", auto: true },
  { id: "delivery", label: "Ticket Delivery", description: "Email sent confirmation", auto: true },
  { id: "checkin", label: "Event Check-in", description: "Attendee checked in", auto: false, available: false },
  { id: "communication", label: "Customer Communication", description: "Email exchanges", auto: false, available: true },
];

export default function ChargebackResponse() {
  const { id: _id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [response, setResponse] = useState(
    `We are disputing this chargeback for the following reasons:\n\n` +
    `1. The customer completed the purchase on ${mockChargeback.transaction.date}\n` +
    `2. Order confirmation was sent to the email on file\n` +
    `3. Tickets were delivered electronically\n\n` +
    `Please see the attached evidence supporting our case.`
  );

  const [selectedEvidence, setSelectedEvidence] = useState<string[]>(["order", "delivery"]);
  const [_customFiles, _setCustomFiles] = useState<File[]>([]);

  const toggleEvidence = (id: string) => {
    if (selectedEvidence.includes(id)) {
      setSelectedEvidence(selectedEvidence.filter(e => e !== id));
    } else {
      setSelectedEvidence([...selectedEvidence, id]);
    }
  };

  const handleSubmit = () => {
    toast.success("Chargeback response submitted!");
    setTimeout(() => navigate("/venue/financials/chargebacks"), 1500);
  };

  const handleAccept = () => {
    toast.info("Chargeback accepted. Funds will be returned to customer.");
    setTimeout(() => navigate("/venue/financials/chargebacks"), 1500);
  };

  return (
    <div className="max-w-4xl mx-auto">
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      <div className="flex items-center gap-4 mb-6">
        <Link to="/venue/financials/chargebacks" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft className="w-6 h-6" />
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Respond to Chargeback</h1>
          <p className="text-gray-500">{mockChargeback.id}</p>
        </div>
      </div>

      <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
        <div className="flex items-center gap-3">
          <Clock className="w-5 h-5 text-red-600" />
          <div>
            <p className="font-medium text-red-800">Response Deadline: {mockChargeback.deadline}</p>
            <p className="text-sm text-red-600">{mockChargeback.daysLeft} days remaining to respond</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Chargeback Details</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Amount</span>
              <span className="font-medium text-red-600">${mockChargeback.amount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Reason</span>
              <span className="font-medium text-gray-900">{mockChargeback.reason}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Filed Date</span>
              <span className="font-medium text-gray-900">{mockChargeback.date}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Original Transaction</h2>
          <div className="space-y-3">
            <div className="flex justify-between">
              <span className="text-gray-500">Transaction ID</span>
              <span className="font-medium text-purple-600">{mockChargeback.transaction.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Date</span>
              <span className="font-medium text-gray-900">{mockChargeback.transaction.date}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Event</span>
              <span className="font-medium text-gray-900">{mockChargeback.event.name}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Evidence</h2>
        <p className="text-sm text-gray-500 mb-4">Select evidence to include with your response</p>
        
        <div className="space-y-3 mb-4">
          {evidenceItems.map((item) => (
            <div 
              key={item.id}
              className={`flex items-center justify-between p-3 rounded-lg border ${
                selectedEvidence.includes(item.id) ? "border-purple-300 bg-purple-50" : "border-gray-200"
              } ${!item.auto && !item.available ? "opacity-50" : "cursor-pointer"}`}
              onClick={() => (item.auto || item.available) && toggleEvidence(item.id)}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedEvidence.includes(item.id)}
                  onChange={() => {}}
                  disabled={!item.auto && !item.available}
                  className="rounded border-gray-300 text-purple-600"
                />
                <div>
                  <p className="font-medium text-gray-900">{item.label}</p>
                  <p className="text-sm text-gray-500">{item.description}</p>
                </div>
              </div>
              {item.auto && (
                <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Auto-included</span>
              )}
              {!item.auto && !item.available && (
                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-500 rounded">Not available</span>
              )}
            </div>
          ))}
        </div>

        <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
          <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
          <p className="text-sm text-gray-600">Upload additional evidence</p>
          <p className="text-xs text-gray-400">PDF, PNG, JPG up to 10MB</p>
          <input type="file" className="hidden" multiple />
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Response</h2>
        <Textarea
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          rows={8}
          placeholder="Write your response..."
        />
      </div>

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={handleAccept}>
          Accept Chargeback
        </Button>
        <div className="flex items-center gap-3">
          <Link to="/venue/financials/chargebacks">
            <Button variant="secondary">Cancel</Button>
          </Link>
          <Button onClick={handleSubmit}>Submit Response</Button>
        </div>
      </div>
    </div>
  );
}

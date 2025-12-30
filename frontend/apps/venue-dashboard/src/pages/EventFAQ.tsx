import { useState } from "react";
import { ArrowLeft, Plus, Edit, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Button, Input, Textarea, Toggle, Modal, ModalFooter, useToast, ToastContainer } from "../components/ui";

const eventName = "Summer Music Festival";

const initialFAQs = [
  { id: 1, question: "What time do doors open?", answer: "Doors open at 5:00 PM, one hour before the event starts at 6:00 PM.", expanded: false },
  { id: 2, question: "Is there parking available?", answer: "Yes, there is a parking garage adjacent to the venue. Parking passes can be purchased as an add-on during checkout or at the venue for $25.", expanded: false },
  { id: 3, question: "What is the refund policy?", answer: "Full refunds are available up to 7 days before the event. Within 7 days, tickets are non-refundable but can be transferred to another person.", expanded: false },
  { id: 4, question: "Are cameras allowed?", answer: "Small personal cameras and phones are allowed. Professional cameras with detachable lenses are not permitted without a media pass.", expanded: false },
  { id: 5, question: "Is the venue accessible?", answer: "Yes, the venue is fully ADA accessible. Please contact us in advance if you need any special accommodations.", expanded: false },
];

const venueFAQs = [
  { id: 101, question: "What items are prohibited?", answer: "Outside food and drinks, weapons, laser pointers, and professional recording equipment are not allowed." },
  { id: 102, question: "Is re-entry allowed?", answer: "Re-entry is permitted with a hand stamp. Please see staff at the exit for a stamp if you plan to leave and return." },
];

const tabs = [
  { name: "Overview", path: "" },
  { name: "Content", path: "/content" },
  { name: "Tickets", path: "/tickets" },
  { name: "FAQ", path: "/faq" },
  { name: "Settings", path: "/settings" },
];

export default function EventFAQ() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();

  const [faqs, setFaqs] = useState(initialFAQs);
  const [useVenueDefaults, setUseVenueDefaults] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [editing, setEditing] = useState<typeof initialFAQs[0] | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<typeof initialFAQs[0] | null>(null);
  const [form, setForm] = useState({ question: "", answer: "" });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("FAQs saved!");
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ question: "", answer: "" });
    setShowModal(true);
  };

  const openEdit = (faq: typeof initialFAQs[0]) => {
    setEditing(faq);
    setForm({ question: faq.question, answer: faq.answer });
    setShowModal(true);
  };

  const handleSaveFAQ = () => {
    if (editing) {
      setFaqs(faqs.map(f => f.id === editing.id ? { ...f, ...form } : f));
      toast.success("FAQ updated!");
    } else {
      setFaqs([...faqs, { id: Date.now(), ...form, expanded: false }]);
      toast.success("FAQ added!");
    }
    setShowModal(false);
  };

  const handleDelete = () => {
    if (deleteTarget) {
      setFaqs(faqs.filter(f => f.id !== deleteTarget.id));
      toast.success("FAQ deleted");
      setShowDeleteModal(false);
      setDeleteTarget(null);
    }
  };

  const toggleExpanded = (faqId: number) => {
    setFaqs(faqs.map(f => f.id === faqId ? { ...f, expanded: !f.expanded } : f));
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newFaqs = [...faqs];
    [newFaqs[index - 1], newFaqs[index]] = [newFaqs[index], newFaqs[index - 1]];
    setFaqs(newFaqs);
  };

  const moveDown = (index: number) => {
    if (index === faqs.length - 1) return;
    const newFaqs = [...faqs];
    [newFaqs[index], newFaqs[index + 1]] = [newFaqs[index + 1], newFaqs[index]];
    setFaqs(newFaqs);
  };

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to={`/venue/events/${id}`} className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{eventName}</h1>
            <p className="text-gray-500 mt-1">Frequently asked questions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="secondary" onClick={openCreate}>
            <Plus className="w-4 h-4" />
            <span>Add Question</span>
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "FAQ"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      {/* Venue Defaults Toggle */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <Toggle
          label="Include venue default FAQs"
          description={`Add ${venueFAQs.length} FAQs from your venue settings`}
          enabled={useVenueDefaults}
          onChange={setUseVenueDefaults}
        />
      </div>

      {/* Event FAQs */}
      <div className="bg-white rounded-lg border border-gray-200 mb-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Event-Specific FAQs</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {faqs.map((faq, index) => (
            <div key={faq.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex flex-col gap-1">
                  <button 
                    onClick={() => moveUp(index)}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    disabled={index === 0}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => moveDown(index)}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30"
                    disabled={index === faqs.length - 1}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
                <div className="flex-1">
                  <button 
                    onClick={() => toggleExpanded(faq.id)}
                    className="flex items-center justify-between w-full text-left"
                  >
                    <p className="font-medium text-gray-900">{faq.question}</p>
                    {faq.expanded ? (
                      <ChevronUp className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                  {faq.expanded && (
                    <p className="mt-2 text-gray-600">{faq.answer}</p>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button 
                    onClick={() => openEdit(faq)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button 
                    onClick={() => { setDeleteTarget(faq); setShowDeleteModal(true); }}
                    className="p-1 text-gray-400 hover:text-red-600"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {faqs.length === 0 && (
            <div className="p-8 text-center text-gray-500">
              No FAQs yet. Click "Add Question" to create one.
            </div>
          )}
        </div>
      </div>

      {/* Venue Default FAQs */}
      {useVenueDefaults && (
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="font-semibold text-gray-900">Venue Default FAQs</h2>
            <p className="text-sm text-gray-500">These are inherited from your venue settings</p>
          </div>
          <div className="divide-y divide-gray-200">
            {venueFAQs.map((faq) => (
              <div key={faq.id} className="p-4">
                <p className="font-medium text-gray-900">{faq.question}</p>
                <p className="mt-1 text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title={editing ? "Edit FAQ" : "Add FAQ"}
        size="md"
      >
        <div className="space-y-4">
          <Input
            label="Question"
            value={form.question}
            onChange={(e) => setForm({ ...form, question: e.target.value })}
            placeholder="e.g. What time do doors open?"
          />
          <Textarea
            label="Answer"
            value={form.answer}
            onChange={(e) => setForm({ ...form, answer: e.target.value })}
            rows={4}
            placeholder="Provide a helpful answer..."
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowModal(false)}>Cancel</Button>
          <Button onClick={handleSaveFAQ}>{editing ? "Save Changes" : "Add FAQ"}</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete FAQ"
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to delete this FAQ? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

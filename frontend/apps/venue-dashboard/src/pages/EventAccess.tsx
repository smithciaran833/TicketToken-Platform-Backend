import { useState } from "react";
import { ArrowLeft, Plus, Copy, Trash2 } from "lucide-react";
import { useParams, Link } from "react-router-dom";
import { Button, Input, Toggle, Modal, ModalFooter, DatePicker, TimePicker, useToast, ToastContainer } from "../components/ui";

const eventName = "Summer Music Festival";

const initialPresaleCodes = [
  { id: 1, code: "FRIENDS2025", maxUses: 100, used: 45 },
  { id: 2, code: "FANCLUB", maxUses: 500, used: 312 },
];

const tabs = [
  { name: "Overview", path: "" },
  { name: "Content", path: "/content" },
  { name: "Tickets", path: "/tickets" },
  { name: "Access", path: "/access" },
  { name: "Guest List", path: "/guests" },
  { name: "Settings", path: "/settings" },
];

export default function EventAccess() {
  const { id } = useParams();
  const basePath = "/venue/events/" + id;
  const toast = useToast();

  const [visibility, setVisibility] = useState("public");
  const [password, setPassword] = useState("");
  const [presaleEnabled, setPresaleEnabled] = useState(true);
  const [presaleStart, setPresaleStart] = useState("2025-06-01");
  const [presaleStartTime, setPresaleStartTime] = useState("10:00");
  const [presaleEnd, setPresaleEnd] = useState("2025-06-15");
  const [presaleEndTime, setPresaleEndTime] = useState("23:59");
  const [generalSaleStart, setGeneralSaleStart] = useState("2025-06-15");
  const [generalSaleStartTime, setGeneralSaleStartTime] = useState("10:00");
  const [generalSaleEnd, setGeneralSaleEnd] = useState("2025-08-15");
  const [generalSaleEndTime, setGeneralSaleEndTime] = useState("18:00");
  
  const [presaleCodes, setPresaleCodes] = useState(initialPresaleCodes);
  const [showAddCodeModal, setShowAddCodeModal] = useState(false);
  const [newCode, setNewCode] = useState({ code: "", maxUses: 100 });

  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    await new Promise(resolve => setTimeout(resolve, 1000));
    setIsSaving(false);
    toast.success("Access settings saved!");
  };

  const handleAddCode = () => {
    if (newCode.code) {
      setPresaleCodes([...presaleCodes, { ...newCode, id: Date.now(), used: 0 }]);
      setShowAddCodeModal(false);
      setNewCode({ code: "", maxUses: 100 });
      toast.success("Presale code added!");
    }
  };

  const handleDeleteCode = (codeId: number) => {
    setPresaleCodes(presaleCodes.filter(c => c.id !== codeId));
    toast.success("Presale code deleted");
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code copied!");
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
            <p className="text-gray-500 mt-1">Access settings</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <Link
              key={tab.name}
              to={basePath + tab.path}
              className={
                tab.name === "Access"
                  ? "px-4 py-3 text-sm font-medium text-purple-600 border-b-2 border-purple-600"
                  : "px-4 py-3 text-sm font-medium text-gray-500 hover:text-gray-700"
              }
            >
              {tab.name}
            </Link>
          ))}
        </div>
      </div>

      <div className="space-y-6">
        {/* Visibility */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Visibility</h2>
          <div className="space-y-3">
            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="visibility"
                value="public"
                checked={visibility === "public"}
                onChange={(e) => setVisibility(e.target.value)}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-gray-900">Public</p>
                <p className="text-sm text-gray-500">Anyone can find and view this event</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="visibility"
                value="private"
                checked={visibility === "private"}
                onChange={(e) => setVisibility(e.target.value)}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-gray-900">Private (Unlisted)</p>
                <p className="text-sm text-gray-500">Only people with the link can view this event</p>
              </div>
            </label>
            <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                name="visibility"
                value="password"
                checked={visibility === "password"}
                onChange={(e) => setVisibility(e.target.value)}
                className="mt-1"
              />
              <div>
                <p className="font-medium text-gray-900">Password Protected</p>
                <p className="text-sm text-gray-500">Require a password to view event details</p>
              </div>
            </label>
          </div>
          {visibility === "password" && (
            <div className="mt-4">
              <Input
                label="Event Password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
              />
            </div>
          )}
        </div>

        {/* Presale */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Presale</h2>
            <Toggle enabled={presaleEnabled} onChange={setPresaleEnabled} />
          </div>
          
          {presaleEnabled && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Presale Start</p>
                  <div className="grid grid-cols-2 gap-2">
                    <DatePicker
                      value={presaleStart}
                      onChange={(e) => setPresaleStart(e.target.value)}
                    />
                    <TimePicker
                      value={presaleStartTime}
                      onChange={(e) => setPresaleStartTime(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Presale End</p>
                  <div className="grid grid-cols-2 gap-2">
                    <DatePicker
                      value={presaleEnd}
                      onChange={(e) => setPresaleEnd(e.target.value)}
                    />
                    <TimePicker
                      value={presaleEndTime}
                      onChange={(e) => setPresaleEndTime(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-gray-200 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-medium text-gray-700">Presale Codes</p>
                  <Button variant="secondary" size="sm" onClick={() => setShowAddCodeModal(true)}>
                    <Plus className="w-4 h-4" />
                    <span>Add Code</span>
                  </Button>
                </div>
                <div className="space-y-2">
                  {presaleCodes.map((code) => (
                    <div key={code.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-sm font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded">
                          {code.code}
                        </span>
                        <span className="text-sm text-gray-500">{code.used} / {code.maxUses} used</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => copyCode(code.code)} className="p-1 text-gray-400 hover:text-gray-600">
                          <Copy className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteCode(code.id)} className="p-1 text-gray-400 hover:text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {presaleCodes.length === 0 && (
                    <p className="text-sm text-gray-500 text-center py-4">No presale codes yet</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* General Sale */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">General Sale</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Sale Start</p>
              <div className="grid grid-cols-2 gap-2">
                <DatePicker
                  value={generalSaleStart}
                  onChange={(e) => setGeneralSaleStart(e.target.value)}
                />
                <TimePicker
                  value={generalSaleStartTime}
                  onChange={(e) => setGeneralSaleStartTime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Sale End</p>
              <div className="grid grid-cols-2 gap-2">
                <DatePicker
                  value={generalSaleEnd}
                  onChange={(e) => setGeneralSaleEnd(e.target.value)}
                />
                <TimePicker
                  value={generalSaleEndTime}
                  onChange={(e) => setGeneralSaleEndTime(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Add Presale Code Modal */}
      <Modal
        isOpen={showAddCodeModal}
        onClose={() => setShowAddCodeModal(false)}
        title="Add Presale Code"
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Code"
            value={newCode.code}
            onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })}
            placeholder="e.g. FRIENDS2025"
          />
          <Input
            label="Max Uses"
            type="number"
            min="1"
            value={newCode.maxUses}
            onChange={(e) => setNewCode({ ...newCode, maxUses: parseInt(e.target.value) || 1 })}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowAddCodeModal(false)}>Cancel</Button>
          <Button onClick={handleAddCode}>Add Code</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

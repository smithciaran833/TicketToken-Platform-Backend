import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, Play, MoreVertical, Edit, Trash2, Clock, Copy, Calendar } from "lucide-react";
import { Button, Dropdown, Modal, ModalFooter, Input, Select, useToast, ToastContainer } from "../../components/ui";

const initialReports = [
  { id: 1, name: "Monthly Sales Summary", source: "Sales Data", lastRun: "2 hours ago", schedule: "Weekly, Mondays", createdAt: "Jun 15, 2025" },
  { id: 2, name: "Event Attendance Report", source: "Attendance Data", lastRun: "Yesterday", schedule: null, createdAt: "Jun 10, 2025" },
  { id: 3, name: "Revenue by Ticket Type", source: "Revenue Data", lastRun: "3 days ago", schedule: "Monthly, 1st", createdAt: "May 20, 2025" },
  { id: 4, name: "Customer Demographics", source: "Customer Data", lastRun: "1 week ago", schedule: null, createdAt: "May 15, 2025" },
];

const frequencies = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const weekdays = [
  { value: "monday", label: "Monday" },
  { value: "tuesday", label: "Tuesday" },
  { value: "wednesday", label: "Wednesday" },
  { value: "thursday", label: "Thursday" },
  { value: "friday", label: "Friday" },
];

const formats = [
  { value: "pdf", label: "PDF" },
  { value: "csv", label: "CSV" },
  { value: "excel", label: "Excel" },
];

export default function SavedReports() {
  const toast = useToast();
  const [reports, setReports] = useState(initialReports);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState<typeof initialReports[0] | null>(null);

  const [scheduleForm, setScheduleForm] = useState({
    frequency: "weekly",
    day: "monday",
    time: "09:00",
    recipients: "",
    format: "pdf",
  });

  const handleRun = (report: typeof initialReports[0]) => {
    toast.success(`Running "${report.name}"...`);
  };

  const handleSchedule = (report: typeof initialReports[0]) => {
    setSelectedReport(report);
    setShowScheduleModal(true);
  };

  const handleSaveSchedule = () => {
    toast.success("Schedule saved!");
    setShowScheduleModal(false);
  };

  const handleDuplicate = (report: typeof initialReports[0]) => {
    const newReport = {
      ...report,
      id: Date.now(),
      name: `${report.name} (Copy)`,
      schedule: null,
    };
    setReports([newReport, ...reports]);
    toast.success("Report duplicated!");
  };

  const handleDelete = () => {
    if (selectedReport) {
      setReports(reports.filter(r => r.id !== selectedReport.id));
      toast.success("Report deleted");
      setShowDeleteModal(false);
    }
  };

  const getDropdownItems = (report: typeof initialReports[0]) => [
    { label: "Run Report", icon: <Play className="w-4 h-4" />, onClick: () => handleRun(report) },
    { label: "Edit", icon: <Edit className="w-4 h-4" />, onClick: () => {} },
    { label: "Schedule", icon: <Clock className="w-4 h-4" />, onClick: () => handleSchedule(report) },
    { label: "Duplicate", icon: <Copy className="w-4 h-4" />, onClick: () => handleDuplicate(report) },
    { divider: true, label: "", onClick: () => {} },
    { label: "Delete", icon: <Trash2 className="w-4 h-4" />, danger: true, onClick: () => { setSelectedReport(report); setShowDeleteModal(true); } },
  ];

  return (
    <div>
      <ToastContainer toasts={toast.toasts} onRemove={toast.removeToast} />

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link to="/venue/analytics/reports" className="text-gray-400 hover:text-gray-600">
            <ArrowLeft className="w-6 h-6" />
          </Link>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Saved Reports</h1>
            <p className="text-gray-500">Manage your custom reports</p>
          </div>
        </div>
        <Link to="/venue/analytics/reports">
          <Button>
            <Plus className="w-4 h-4" />
            Create Report
          </Button>
        </Link>
      </div>

      {/* Reports List */}
      <div className="bg-white rounded-lg border border-gray-200">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Report Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Data Source</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Run</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Schedule</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {reports.map((report) => (
              <tr key={report.id} className="hover:bg-gray-50">
                <td className="px-6 py-4">
                  <button 
                    onClick={() => handleRun(report)}
                    className="font-medium text-purple-600 hover:text-purple-700"
                  >
                    {report.name}
                  </button>
                  <p className="text-xs text-gray-500">Created {report.createdAt}</p>
                </td>
                <td className="px-6 py-4 text-sm text-gray-600">{report.source}</td>
                <td className="px-6 py-4 text-sm text-gray-600">{report.lastRun}</td>
                <td className="px-6 py-4">
                  {report.schedule ? (
                    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                      <Calendar className="w-3 h-3" />
                      {report.schedule}
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">Not scheduled</span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button variant="secondary" size="sm" onClick={() => handleRun(report)}>
                      <Play className="w-4 h-4" />
                      Run
                    </Button>
                    <Dropdown trigger={<MoreVertical className="w-5 h-5" />} items={getDropdownItems(report)} />
                  </div>
                </td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-gray-500">
                  No saved reports yet. Create your first report to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Schedule Modal */}
      <Modal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title="Schedule Report"
      >
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-3 mb-4">
            <p className="font-medium text-gray-900">{selectedReport?.name}</p>
          </div>

          <Select
            label="Frequency"
            options={frequencies}
            value={scheduleForm.frequency}
            onChange={(e) => setScheduleForm({ ...scheduleForm, frequency: e.target.value })}
          />

          {scheduleForm.frequency === "weekly" && (
            <Select
              label="Day of Week"
              options={weekdays}
              value={scheduleForm.day}
              onChange={(e) => setScheduleForm({ ...scheduleForm, day: e.target.value })}
            />
          )}

          {scheduleForm.frequency === "monthly" && (
            <Input
              label="Day of Month"
              type="number"
              min="1"
              max="28"
              value="1"
              onChange={() => {}}
            />
          )}

          <Input
            label="Time of Day"
            type="time"
            value={scheduleForm.time}
            onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })}
          />

          <Input
            label="Email Recipients"
            placeholder="email@example.com, another@example.com"
            value={scheduleForm.recipients}
            onChange={(e) => setScheduleForm({ ...scheduleForm, recipients: e.target.value })}
            helper="Comma-separated email addresses"
          />

          <Select
            label="Export Format"
            options={formats}
            value={scheduleForm.format}
            onChange={(e) => setScheduleForm({ ...scheduleForm, format: e.target.value })}
          />
        </div>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowScheduleModal(false)}>Cancel</Button>
          <Button onClick={handleSaveSchedule}>Save Schedule</Button>
        </ModalFooter>
      </Modal>

      {/* Delete Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Report"
        size="sm"
      >
        <p className="text-gray-600">
          Are you sure you want to delete <strong>{selectedReport?.name}</strong>? This action cannot be undone.
        </p>
        <ModalFooter>
          <Button variant="secondary" onClick={() => setShowDeleteModal(false)}>Cancel</Button>
          <Button variant="danger" onClick={handleDelete}>Delete</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

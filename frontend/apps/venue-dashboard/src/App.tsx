import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import DashboardLayout from "./components/layout/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import Events from "./pages/Events";
import EventCalendar from "./pages/EventCalendar";
import EventDetail from "./pages/EventDetail";
import EventTickets from "./pages/EventTickets";
import EventSales from "./pages/EventSales";
import EventGuests from "./pages/EventGuests";
import EventSettings from "./pages/EventSettings";
import EventContent from "./pages/EventContent";
import EventSeating from "./pages/EventSeating";
import EventAccess from "./pages/EventAccess";
import EventLogistics from "./pages/EventLogistics";
import EventAutomation from "./pages/EventAutomation";
import EventSummary from "./pages/EventSummary";
import EventReviews from "./pages/EventReviews";
import EventPreview from "./pages/EventPreview";
import EventFAQ from "./pages/EventFAQ";
import CreateEvent from "./pages/CreateEvent";
import EditEvent from "./pages/EditEvent";

// Auth Section
import {
  Login,
  ForgotPassword,
  ResetPassword,
  AcceptInvite,
  VerifyEmail,
  OnboardingWelcome,
  ConnectStripe
} from "./pages/Auth";

// Tickets Section
import TicketTypesList from "./pages/Tickets";
import CreateTicketType from "./pages/Tickets/CreateTicketType";
import EditTicketType from "./pages/Tickets/EditTicketType";
import BundlesList from "./pages/Tickets/BundlesList";
import CreateBundle from "./pages/Tickets/CreateBundle";
import EditBundle from "./pages/Tickets/EditBundle";
import AddOnsList from "./pages/Tickets/AddOnsList";
import CreateAddOn from "./pages/Tickets/CreateAddOn";
import EditAddOn from "./pages/Tickets/EditAddOn";
import PromoCodesList from "./pages/Tickets/PromoCodesList";
import CreatePromoCode from "./pages/Tickets/CreatePromoCode";
import PromoCodeDetail from "./pages/Tickets/PromoCodeDetail";
import EditPromoCode from "./pages/Tickets/EditPromoCode";
import BulkPromoCodes from "./pages/Tickets/BulkPromoCodes";
import PromoAnalytics from "./pages/Tickets/PromoAnalytics";

// Scanning Section
import ScannerHome from "./pages/Scanning";
import EventScanning from "./pages/Scanning/EventScanning";
import ScanHistory from "./pages/Scanning/ScanHistory";
import ZoneOccupancy from "./pages/Scanning/ZoneOccupancy";
import CapacityAlerts from "./pages/Scanning/CapacityAlerts";
import BannedList from "./pages/Scanning/BannedList";
import ScannerSettings from "./pages/Scanning/ScannerSettings";

// Analytics Section
import AnalyticsDashboard from "./pages/Analytics";
import SalesAnalytics from "./pages/Analytics/SalesAnalytics";
import RevenueAnalytics from "./pages/Analytics/RevenueAnalytics";
import AttendanceAnalytics from "./pages/Analytics/AttendanceAnalytics";
import Demographics from "./pages/Analytics/Demographics";
import GeographicAnalytics from "./pages/Analytics/GeographicAnalytics";
import EventComparison from "./pages/Analytics/EventComparison";
import CustomReports from "./pages/Analytics/CustomReports";
import SavedReports from "./pages/Analytics/SavedReports";

// Financials Section
import FinancialsOverview from "./pages/Financials";
import RevenueDashboard from "./pages/Financials/RevenueDashboard";
import TransactionsList from "./pages/Financials/TransactionsList";
import TransactionDetail from "./pages/Financials/TransactionDetail";
import PayoutsList from "./pages/Financials/PayoutsList";
import PayoutDetail from "./pages/Financials/PayoutDetail";
import PayoutSettings from "./pages/Financials/PayoutSettings";
import RefundsList from "./pages/Financials/RefundsList";
import Chargebacks from "./pages/Financials/Chargebacks";
import ChargebackResponse from "./pages/Financials/ChargebackResponse";
import TaxDocuments from "./pages/Financials/TaxDocuments";

// Marketing Section
import MarketingDashboard from "./pages/Marketing";
import AnnouncementsList from "./pages/Marketing/AnnouncementsList";
import CreateAnnouncement from "./pages/Marketing/CreateAnnouncement";
import MessageTicketHolders from "./pages/Marketing/MessageTicketHolders";
import ScheduledMessages from "./pages/Marketing/ScheduledMessages";
import MessageHistory from "./pages/Marketing/MessageHistory";
import MessageTemplates from "./pages/Marketing/MessageTemplates";

// Resale Section
import ResaleSettings from "./pages/Resale";
import PriceRules from "./pages/Resale/PriceRules";
import RoyaltySettings from "./pages/Resale/RoyaltySettings";
import Marketplace from "./pages/Resale/Marketplace";
import ResaleAnalytics from "./pages/Resale/ResaleAnalytics";
import ResalePolicies from "./pages/Resale/ResalePolicies";

// Team Section
import StaffList from "./pages/Team";
import StaffRoles from "./pages/Team/StaffRoles";
import AddStaffMember from "./pages/Team/AddStaffMember";
import StaffAssignments from "./pages/Team/StaffAssignments";
import SecurityCheckpoints from "./pages/Team/SecurityCheckpoints";
import StaffCheckIn from "./pages/Team/StaffCheckIn";
import StaffAnnouncements from "./pages/Team/StaffAnnouncements";
import StaffOnDuty from "./pages/Team/StaffOnDuty";
import InviteMember from "./pages/Team/InviteMember";
import MemberDetail from "./pages/Team/MemberDetail";
import EditPermissions from "./pages/Team/EditPermissions";
import TransferOwnership from "./pages/Team/TransferOwnership";
import AuditLog from "./pages/Team/AuditLog";
import TwoFactorSetup from "./pages/Team/TwoFactorSetup";

// Settings Section
import SettingsIndex from "./pages/Settings";
import VenueProfile from "./pages/Settings/VenueProfile";
import VenueMedia from "./pages/Settings/VenueMedia";
import VenueSocial from "./pages/Settings/VenueSocial";
import VenueHours from "./pages/Settings/VenueHours";
import VenuePreview from "./pages/Settings/VenuePreview";
import VenueLocation from "./pages/Settings/VenueLocation";
import VenueParking from "./pages/Settings/VenueParking";
import VenueTransit from "./pages/Settings/VenueTransit";
import VenueLoadIn from "./pages/Settings/VenueLoadIn";
import VenueCurfew from "./pages/Settings/VenueCurfew";
import VenueAge from "./pages/Settings/VenueAge";
import EntryPoints from "./pages/Settings/EntryPoints";
import ExitPoints from "./pages/Settings/ExitPoints";
import ReEntryPolicy from "./pages/Settings/ReEntryPolicy";
import CapacitySettings from "./pages/Settings/CapacitySettings";
import SeatingConfigs from "./pages/Settings/SeatingConfigs";
import SeatingMapBuilder from "./pages/Settings/SeatingMapBuilder";
import SeatingSections from "./pages/Settings/SeatingSections";
import SeatingAccessibility from "./pages/Settings/SeatingAccessibility";
import SeatingPreview from "./pages/Settings/SeatingPreview";
import VIPAreas from "./pages/Settings/VIPAreas";
import VIPAccess from "./pages/Settings/VIPAccess";
import VIPAmenities from "./pages/Settings/VIPAmenities";
import VIPGuestLists from "./pages/Settings/VIPGuestLists";
import VIPWillCall from "./pages/Settings/VIPWillCall";
import VIPIDVerify from "./pages/Settings/VIPIDVerify";
import LegalTax from "./pages/Settings/LegalTax";
import LegalInsurance from "./pages/Settings/LegalInsurance";
import LegalLiquor from "./pages/Settings/LegalLiquor";
import LegalPayouts from "./pages/Settings/LegalPayouts";
import LegalVerification from "./pages/Settings/LegalVerification";
import LegalVerificationSubmit from "./pages/Settings/LegalVerificationSubmit";
import BrandingLogo from "./pages/Settings/BrandingLogo";
import BrandingTickets from "./pages/Settings/BrandingTickets";
import BrandingEmail from "./pages/Settings/BrandingEmail";
import BrandingPreview from "./pages/Settings/BrandingPreview";
import BrandingDomain from "./pages/Settings/BrandingDomain";
import CommEmailTemplates from "./pages/Settings/CommEmailTemplates";
import CommEmailCreate from "./pages/Settings/CommEmailCreate";
import CommEmailPreview from "./pages/Settings/CommEmailPreview";
import CommSMSTemplates from "./pages/Settings/CommSMSTemplates";
import CommSMSCreate from "./pages/Settings/CommSMSCreate";
import CommNotifications from "./pages/Settings/CommNotifications";
import PolicyRefund from "./pages/Settings/PolicyRefund";
import PolicyAge from "./pages/Settings/PolicyAge";
import PolicyBags from "./pages/Settings/PolicyBags";
import PolicyCustom from "./pages/Settings/PolicyCustom";
import PolicyCustomCreate from "./pages/Settings/PolicyCustomCreate";
import SafetyEmergency from "./pages/Settings/SafetyEmergency";
import SafetyEvacuation from "./pages/Settings/SafetyEvacuation";
import SafetyProtocols from "./pages/Settings/SafetyProtocols";
import SafetyMedical from "./pages/Settings/SafetyMedical";

// Operations Section
import OperationsIndex from "./pages/Operations";
import IncidentsList from "./pages/Operations/IncidentsList";
import LogIncident from "./pages/Operations/LogIncident";
import IncidentDetail from "./pages/Operations/IncidentDetail";
import EquipmentList from "./pages/Operations/EquipmentList";
import AddEquipment from "./pages/Operations/AddEquipment";
import EquipmentCheck from "./pages/Operations/EquipmentCheck";

// Multi-Venue Section
import VenuesList from "./pages/Venues";
import AddVenue from "./pages/Venues/AddVenue";
import CrossVenueAnalytics from "./pages/Venues/CrossVenueAnalytics";
import CompareVenues from "./pages/Venues/CompareVenues";

// Support Section
import HelpCenter from "./pages/Support";
import SearchHelp from "./pages/Support/SearchHelp";
import HelpArticle from "./pages/Support/HelpArticle";
import TutorialVideos from "./pages/Support/TutorialVideos";
import GettingStarted from "./pages/Support/GettingStarted";
import BestPractices from "./pages/Support/BestPractices";
import ContactSupport from "./pages/Support/ContactSupport";
import LiveChat from "./pages/Support/LiveChat";
import ScheduleCall from "./pages/Support/ScheduleCall";
import EmergencyHotline from "./pages/Support/EmergencyHotline";
import AccountManager from "./pages/Support/AccountManager";
import RequestAccountManager from "./pages/Support/RequestAccountManager";
import TrainingSessions from "./pages/Support/TrainingSessions";
import TrainingMaterials from "./pages/Support/TrainingMaterials";
import Sandbox from "./pages/Support/Sandbox";
import BugReport from "./pages/Support/BugReport";
import FeatureRequest from "./pages/Support/FeatureRequest";
import VoteFeatures from "./pages/Support/VoteFeatures";
import SupportTickets from "./pages/Support/SupportTickets";
import TicketDetail from "./pages/Support/TicketDetail";
import LegalTerms from "./pages/Support/LegalTerms";
import LegalPrivacy from "./pages/Support/LegalPrivacy";
import LegalCompliance from "./pages/Support/LegalCompliance";
import TaxForms from "./pages/Support/TaxForms";
import PlatformAnnouncements from "./pages/Support/PlatformAnnouncements";
import PlatformStatus from "./pages/Support/PlatformStatus";
import SubscribeUpdates from "./pages/Support/SubscribeUpdates";

// Account Section
import AccountSettings from "./pages/Account";
import EditProfile from "./pages/Account/EditProfile";
import ChangePassword from "./pages/Account/ChangePassword";
import Enable2FA from "./pages/Account/Enable2FA";
import NotificationPreferences from "./pages/Account/NotificationPreferences";

// Auth routes that don't use DashboardLayout
const authRoutes = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/invite",
  "/verify-email",
  "/onboarding"
];

function isAuthRoute(pathname: string): boolean {
  return authRoutes.some(route => pathname.startsWith(route));
}

function isEventPreviewPath(pathname: string): boolean {
  const parts = pathname.split('/');
  return parts.length === 5 && parts[1] === 'venue' && parts[2] === 'events' && parts[4] === 'preview';
}

function AppContent() {
  const location = useLocation();

  // Auth routes - no layout
  if (isAuthRoute(location.pathname)) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/invite/:token" element={<AcceptInvite />} />
        <Route path="/verify-email/:token" element={<VerifyEmail />} />
        <Route path="/onboarding" element={<OnboardingWelcome />} />
        <Route path="/onboarding/payments" element={<ConnectStripe />} />
      </Routes>
    );
  }

  // Event preview - no layout
  if (isEventPreviewPath(location.pathname)) {
    return (
      <Routes>
        <Route path="/venue/events/:id/preview" element={<EventPreview />} />
      </Routes>
    );
  }

  // Dashboard routes - with layout
  return (
    <DashboardLayout>
      <Routes>
        <Route path="/venue" element={<Dashboard />} />

        {/* Events */}
        <Route path="/venue/events" element={<Events />} />
        <Route path="/venue/events/calendar" element={<EventCalendar />} />
        <Route path="/venue/events/new" element={<CreateEvent />} />
        <Route path="/venue/events/:id" element={<EventDetail />} />
        <Route path="/venue/events/:id/edit" element={<EditEvent />} />
        <Route path="/venue/events/:id/content" element={<EventContent />} />
        <Route path="/venue/events/:id/tickets" element={<EventTickets />} />
        <Route path="/venue/events/:id/seating" element={<EventSeating />} />
        <Route path="/venue/events/:id/access" element={<EventAccess />} />
        <Route path="/venue/events/:id/logistics" element={<EventLogistics />} />
        <Route path="/venue/events/:id/sales" element={<EventSales />} />
        <Route path="/venue/events/:id/guests" element={<EventGuests />} />
        <Route path="/venue/events/:id/automation" element={<EventAutomation />} />
        <Route path="/venue/events/:id/summary" element={<EventSummary />} />
        <Route path="/venue/events/:id/reviews" element={<EventReviews />} />
        <Route path="/venue/events/:id/faq" element={<EventFAQ />} />
        <Route path="/venue/events/:id/settings" element={<EventSettings />} />

        {/* Tickets */}
        <Route path="/venue/tickets" element={<TicketTypesList />} />
        <Route path="/venue/tickets/new" element={<CreateTicketType />} />
        <Route path="/venue/tickets/:id/edit" element={<EditTicketType />} />
        <Route path="/venue/tickets/bundles" element={<BundlesList />} />
        <Route path="/venue/tickets/bundles/new" element={<CreateBundle />} />
        <Route path="/venue/tickets/bundles/:id/edit" element={<EditBundle />} />
        <Route path="/venue/tickets/addons" element={<AddOnsList />} />
        <Route path="/venue/tickets/addons/new" element={<CreateAddOn />} />
        <Route path="/venue/tickets/addons/:id/edit" element={<EditAddOn />} />
        <Route path="/venue/tickets/promos" element={<PromoCodesList />} />
        <Route path="/venue/tickets/promos/new" element={<CreatePromoCode />} />
        <Route path="/venue/tickets/promos/bulk" element={<BulkPromoCodes />} />
        <Route path="/venue/tickets/promos/analytics" element={<PromoAnalytics />} />
        <Route path="/venue/tickets/promos/:id" element={<PromoCodeDetail />} />
        <Route path="/venue/tickets/promos/:id/edit" element={<EditPromoCode />} />

        {/* Scanning */}
        <Route path="/venue/scanning" element={<ScannerHome />} />
        <Route path="/venue/scanning/event/:id" element={<EventScanning />} />
        <Route path="/venue/scanning/history" element={<ScanHistory />} />
        <Route path="/venue/scanning/zones" element={<ZoneOccupancy />} />
        <Route path="/venue/scanning/alerts" element={<CapacityAlerts />} />
        <Route path="/venue/scanning/banned" element={<BannedList />} />
        <Route path="/venue/scanning/settings" element={<ScannerSettings />} />

        {/* Analytics */}
        <Route path="/venue/analytics" element={<AnalyticsDashboard />} />
        <Route path="/venue/analytics/sales" element={<SalesAnalytics />} />
        <Route path="/venue/analytics/revenue" element={<RevenueAnalytics />} />
        <Route path="/venue/analytics/attendance" element={<AttendanceAnalytics />} />
        <Route path="/venue/analytics/demographics" element={<Demographics />} />
        <Route path="/venue/analytics/geographic" element={<GeographicAnalytics />} />
        <Route path="/venue/analytics/compare" element={<EventComparison />} />
        <Route path="/venue/analytics/reports" element={<CustomReports />} />
        <Route path="/venue/analytics/reports/saved" element={<SavedReports />} />

        {/* Financials */}
        <Route path="/venue/financials" element={<FinancialsOverview />} />
        <Route path="/venue/financials/revenue" element={<RevenueDashboard />} />
        <Route path="/venue/financials/transactions" element={<TransactionsList />} />
        <Route path="/venue/financials/transactions/:id" element={<TransactionDetail />} />
        <Route path="/venue/financials/payouts" element={<PayoutsList />} />
        <Route path="/venue/financials/payouts/:id" element={<PayoutDetail />} />
        <Route path="/venue/financials/settings" element={<PayoutSettings />} />
        <Route path="/venue/financials/refunds" element={<RefundsList />} />
        <Route path="/venue/financials/chargebacks" element={<Chargebacks />} />
        <Route path="/venue/financials/chargebacks/:id" element={<ChargebackResponse />} />
        <Route path="/venue/financials/tax" element={<TaxDocuments />} />

        {/* Marketing */}
        <Route path="/venue/marketing" element={<MarketingDashboard />} />
        <Route path="/venue/marketing/announcements" element={<AnnouncementsList />} />
        <Route path="/venue/marketing/announcements/new" element={<CreateAnnouncement />} />
        <Route path="/venue/marketing/message" element={<MessageTicketHolders />} />
        <Route path="/venue/marketing/scheduled" element={<ScheduledMessages />} />
        <Route path="/venue/marketing/history" element={<MessageHistory />} />
        <Route path="/venue/marketing/templates" element={<MessageTemplates />} />

        {/* Resale */}
        <Route path="/venue/resale" element={<ResaleSettings />} />
        <Route path="/venue/resale/pricing" element={<PriceRules />} />
        <Route path="/venue/resale/royalties" element={<RoyaltySettings />} />
        <Route path="/venue/resale/marketplace" element={<Marketplace />} />
        <Route path="/venue/resale/analytics" element={<ResaleAnalytics />} />
        <Route path="/venue/resale/policies" element={<ResalePolicies />} />

        {/* Team */}
        <Route path="/venue/team" element={<StaffList />} />
        <Route path="/venue/team/roles" element={<StaffRoles />} />
        <Route path="/venue/team/add" element={<AddStaffMember />} />
        <Route path="/venue/team/invite" element={<InviteMember />} />
        <Route path="/venue/team/assignments" element={<StaffAssignments />} />
        <Route path="/venue/team/checkpoints" element={<SecurityCheckpoints />} />
        <Route path="/venue/team/checkin" element={<StaffCheckIn />} />
        <Route path="/venue/team/announcements" element={<StaffAnnouncements />} />
        <Route path="/venue/team/onduty" element={<StaffOnDuty />} />
        <Route path="/venue/team/transfer" element={<TransferOwnership />} />
        <Route path="/venue/team/audit" element={<AuditLog />} />
        <Route path="/venue/team/2fa" element={<TwoFactorSetup />} />
        <Route path="/venue/team/:id" element={<MemberDetail />} />
        <Route path="/venue/team/:id/permissions" element={<EditPermissions />} />

        {/* Settings */}
        <Route path="/venue/settings" element={<SettingsIndex />} />
        <Route path="/venue/settings/profile" element={<VenueProfile />} />
        <Route path="/venue/settings/media" element={<VenueMedia />} />
        <Route path="/venue/settings/social" element={<VenueSocial />} />
        <Route path="/venue/settings/hours" element={<VenueHours />} />
        <Route path="/venue/settings/preview" element={<VenuePreview />} />
        <Route path="/venue/settings/location" element={<VenueLocation />} />
        <Route path="/venue/settings/parking" element={<VenueParking />} />
        <Route path="/venue/settings/transit" element={<VenueTransit />} />
        <Route path="/venue/settings/loadin" element={<VenueLoadIn />} />
        <Route path="/venue/settings/curfew" element={<VenueCurfew />} />
        <Route path="/venue/settings/age" element={<VenueAge />} />
        <Route path="/venue/settings/entry" element={<EntryPoints />} />
        <Route path="/venue/settings/exit" element={<ExitPoints />} />
        <Route path="/venue/settings/reentry" element={<ReEntryPolicy />} />
        <Route path="/venue/settings/capacity" element={<CapacitySettings />} />
        <Route path="/venue/settings/seating/configs" element={<SeatingConfigs />} />
        <Route path="/venue/settings/seating/builder" element={<SeatingMapBuilder />} />
        <Route path="/venue/settings/seating/sections" element={<SeatingSections />} />
        <Route path="/venue/settings/seating/accessibility" element={<SeatingAccessibility />} />
        <Route path="/venue/settings/seating/preview" element={<SeatingPreview />} />
        <Route path="/venue/settings/vip/areas" element={<VIPAreas />} />
        <Route path="/venue/settings/vip/access" element={<VIPAccess />} />
        <Route path="/venue/settings/vip/amenities" element={<VIPAmenities />} />
        <Route path="/venue/settings/vip/guestlists" element={<VIPGuestLists />} />
        <Route path="/venue/settings/vip/willcall" element={<VIPWillCall />} />
        <Route path="/venue/settings/vip/idverify" element={<VIPIDVerify />} />
        <Route path="/venue/settings/legal/tax" element={<LegalTax />} />
        <Route path="/venue/settings/legal/insurance" element={<LegalInsurance />} />
        <Route path="/venue/settings/legal/liquor" element={<LegalLiquor />} />
        <Route path="/venue/settings/legal/payouts" element={<LegalPayouts />} />
        <Route path="/venue/settings/legal/verification" element={<LegalVerification />} />
        <Route path="/venue/settings/legal/verification/submit" element={<LegalVerificationSubmit />} />
        <Route path="/venue/settings/branding/logo" element={<BrandingLogo />} />
        <Route path="/venue/settings/branding/tickets" element={<BrandingTickets />} />
        <Route path="/venue/settings/branding/email" element={<BrandingEmail />} />
        <Route path="/venue/settings/branding/preview" element={<BrandingPreview />} />
        <Route path="/venue/settings/branding/domain" element={<BrandingDomain />} />
        <Route path="/venue/settings/communication/email" element={<CommEmailTemplates />} />
        <Route path="/venue/settings/communication/email/new" element={<CommEmailCreate />} />
        <Route path="/venue/settings/communication/email/preview" element={<CommEmailPreview />} />
        <Route path="/venue/settings/communication/sms" element={<CommSMSTemplates />} />
        <Route path="/venue/settings/communication/sms/new" element={<CommSMSCreate />} />
        <Route path="/venue/settings/communication/notifications" element={<CommNotifications />} />
        <Route path="/venue/settings/policies/refund" element={<PolicyRefund />} />
        <Route path="/venue/settings/policies/age" element={<PolicyAge />} />
        <Route path="/venue/settings/policies/bags" element={<PolicyBags />} />
        <Route path="/venue/settings/policies/custom" element={<PolicyCustom />} />
        <Route path="/venue/settings/policies/custom/new" element={<PolicyCustomCreate />} />
        <Route path="/venue/settings/safety/emergency" element={<SafetyEmergency />} />
        <Route path="/venue/settings/safety/evacuation" element={<SafetyEvacuation />} />
        <Route path="/venue/settings/safety/protocols" element={<SafetyProtocols />} />
        <Route path="/venue/settings/safety/medical" element={<SafetyMedical />} />

        {/* Operations */}
        <Route path="/venue/operations" element={<OperationsIndex />} />
        <Route path="/venue/operations/incidents" element={<IncidentsList />} />
        <Route path="/venue/operations/incidents/new" element={<LogIncident />} />
        <Route path="/venue/operations/incidents/:id" element={<IncidentDetail />} />
        <Route path="/venue/operations/equipment" element={<EquipmentList />} />
        <Route path="/venue/operations/equipment/new" element={<AddEquipment />} />
        <Route path="/venue/operations/equipment/check" element={<EquipmentCheck />} />

        {/* Multi-Venue */}
        <Route path="/venues" element={<VenuesList />} />
        <Route path="/venues/new" element={<AddVenue />} />
        <Route path="/venues/analytics" element={<CrossVenueAnalytics />} />
        <Route path="/venues/compare" element={<CompareVenues />} />

        {/* Support */}
        <Route path="/venue/support" element={<HelpCenter />} />
        <Route path="/venue/support/search" element={<SearchHelp />} />
        <Route path="/venue/support/articles/:id" element={<HelpArticle />} />
        <Route path="/venue/support/tutorials" element={<TutorialVideos />} />
        <Route path="/venue/support/getting-started" element={<GettingStarted />} />
        <Route path="/venue/support/best-practices" element={<BestPractices />} />
        <Route path="/venue/support/contact" element={<ContactSupport />} />
        <Route path="/venue/support/chat" element={<LiveChat />} />
        <Route path="/venue/support/schedule" element={<ScheduleCall />} />
        <Route path="/venue/support/emergency" element={<EmergencyHotline />} />
        <Route path="/venue/support/account-manager" element={<AccountManager />} />
        <Route path="/venue/support/account-manager/request" element={<RequestAccountManager />} />
        <Route path="/venue/support/training" element={<TrainingSessions />} />
        <Route path="/venue/support/training/materials" element={<TrainingMaterials />} />
        <Route path="/venue/support/sandbox" element={<Sandbox />} />
        <Route path="/venue/support/bug-report" element={<BugReport />} />
        <Route path="/venue/support/feature-request" element={<FeatureRequest />} />
        <Route path="/venue/support/features" element={<VoteFeatures />} />
        <Route path="/venue/support/tickets" element={<SupportTickets />} />
        <Route path="/venue/support/tickets/:id" element={<TicketDetail />} />
        <Route path="/venue/support/legal/terms" element={<LegalTerms />} />
        <Route path="/venue/support/legal/privacy" element={<LegalPrivacy />} />
        <Route path="/venue/support/legal/compliance" element={<LegalCompliance />} />
        <Route path="/venue/support/legal/tax-forms" element={<TaxForms />} />
        <Route path="/venue/support/announcements" element={<PlatformAnnouncements />} />
        <Route path="/venue/support/status" element={<PlatformStatus />} />
        <Route path="/venue/support/subscribe" element={<SubscribeUpdates />} />

        {/* Account */}
        <Route path="/account/settings" element={<AccountSettings />} />
        <Route path="/account/profile" element={<EditProfile />} />
        <Route path="/account/password" element={<ChangePassword />} />
        <Route path="/account/2fa" element={<Enable2FA />} />
        <Route path="/account/notifications" element={<NotificationPreferences />} />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
      </Routes>
    </DashboardLayout>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;

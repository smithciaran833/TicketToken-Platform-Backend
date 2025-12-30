import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, useLocation, Navigate } from "react-router-dom";
import DashboardLayout from "./components/layout/DashboardLayout";

// Loading spinner shown while chunks load
function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    </div>
  );
}

// Core pages - loaded immediately (small, frequently used)
import Dashboard from "./pages/Dashboard";
import {
  Login,
  ForgotPassword,
  ResetPassword,
  AcceptInvite,
  VerifyEmail,
  OnboardingWelcome,
  ConnectStripe
} from "./pages/Auth";

// Events Section - lazy loaded
const Events = lazy(() => import("./pages/Events"));
const EventCalendar = lazy(() => import("./pages/EventCalendar"));
const EventDetail = lazy(() => import("./pages/EventDetail"));
const EventTickets = lazy(() => import("./pages/EventTickets"));
const EventSales = lazy(() => import("./pages/EventSales"));
const EventGuests = lazy(() => import("./pages/EventGuests"));
const EventSettings = lazy(() => import("./pages/EventSettings"));
const EventContent = lazy(() => import("./pages/EventContent"));
const EventSeating = lazy(() => import("./pages/EventSeating"));
const EventAccess = lazy(() => import("./pages/EventAccess"));
const EventLogistics = lazy(() => import("./pages/EventLogistics"));
const EventAutomation = lazy(() => import("./pages/EventAutomation"));
const EventSummary = lazy(() => import("./pages/EventSummary"));
const EventReviews = lazy(() => import("./pages/EventReviews"));
const EventPreview = lazy(() => import("./pages/EventPreview"));
const EventFAQ = lazy(() => import("./pages/EventFAQ"));
const CreateEvent = lazy(() => import("./pages/CreateEvent"));
const EditEvent = lazy(() => import("./pages/EditEvent"));

// Tickets Section - lazy loaded
const TicketTypesList = lazy(() => import("./pages/Tickets"));
const CreateTicketType = lazy(() => import("./pages/Tickets/CreateTicketType"));
const EditTicketType = lazy(() => import("./pages/Tickets/EditTicketType"));
const BundlesList = lazy(() => import("./pages/Tickets/BundlesList"));
const CreateBundle = lazy(() => import("./pages/Tickets/CreateBundle"));
const EditBundle = lazy(() => import("./pages/Tickets/EditBundle"));
const AddOnsList = lazy(() => import("./pages/Tickets/AddOnsList"));
const CreateAddOn = lazy(() => import("./pages/Tickets/CreateAddOn"));
const EditAddOn = lazy(() => import("./pages/Tickets/EditAddOn"));
const PromoCodesList = lazy(() => import("./pages/Tickets/PromoCodesList"));
const CreatePromoCode = lazy(() => import("./pages/Tickets/CreatePromoCode"));
const PromoCodeDetail = lazy(() => import("./pages/Tickets/PromoCodeDetail"));
const EditPromoCode = lazy(() => import("./pages/Tickets/EditPromoCode"));
const BulkPromoCodes = lazy(() => import("./pages/Tickets/BulkPromoCodes"));
const PromoAnalytics = lazy(() => import("./pages/Tickets/PromoAnalytics"));

// Scanning Section - lazy loaded
const ScannerHome = lazy(() => import("./pages/Scanning"));
const EventScanning = lazy(() => import("./pages/Scanning/EventScanning"));
const ScanHistory = lazy(() => import("./pages/Scanning/ScanHistory"));
const ZoneOccupancy = lazy(() => import("./pages/Scanning/ZoneOccupancy"));
const CapacityAlerts = lazy(() => import("./pages/Scanning/CapacityAlerts"));
const BannedList = lazy(() => import("./pages/Scanning/BannedList"));
const ScannerSettings = lazy(() => import("./pages/Scanning/ScannerSettings"));

// Analytics Section - lazy loaded
const AnalyticsDashboard = lazy(() => import("./pages/Analytics"));
const SalesAnalytics = lazy(() => import("./pages/Analytics/SalesAnalytics"));
const RevenueAnalytics = lazy(() => import("./pages/Analytics/RevenueAnalytics"));
const AttendanceAnalytics = lazy(() => import("./pages/Analytics/AttendanceAnalytics"));
const Demographics = lazy(() => import("./pages/Analytics/Demographics"));
const GeographicAnalytics = lazy(() => import("./pages/Analytics/GeographicAnalytics"));
const EventComparison = lazy(() => import("./pages/Analytics/EventComparison"));
const CustomReports = lazy(() => import("./pages/Analytics/CustomReports"));
const SavedReports = lazy(() => import("./pages/Analytics/SavedReports"));

// Financials Section - lazy loaded
const FinancialsOverview = lazy(() => import("./pages/Financials"));
const RevenueDashboard = lazy(() => import("./pages/Financials/RevenueDashboard"));
const TransactionsList = lazy(() => import("./pages/Financials/TransactionsList"));
const TransactionDetail = lazy(() => import("./pages/Financials/TransactionDetail"));
const PayoutsList = lazy(() => import("./pages/Financials/PayoutsList"));
const PayoutDetail = lazy(() => import("./pages/Financials/PayoutDetail"));
const PayoutSettings = lazy(() => import("./pages/Financials/PayoutSettings"));
const FailedPayouts = lazy(() => import("./pages/Financials/FailedPayouts"));
const RefundsList = lazy(() => import("./pages/Financials/RefundsList"));
const RefundDetail = lazy(() => import("./pages/Financials/RefundDetail"));
const Chargebacks = lazy(() => import("./pages/Financials/Chargebacks"));
const ChargebackResponse = lazy(() => import("./pages/Financials/ChargebackResponse"));
const TaxDocuments = lazy(() => import("./pages/Financials/TaxDocuments"));

// Marketing Section - lazy loaded
const MarketingDashboard = lazy(() => import("./pages/Marketing"));
const AnnouncementsList = lazy(() => import("./pages/Marketing/AnnouncementsList"));
const CreateAnnouncement = lazy(() => import("./pages/Marketing/CreateAnnouncement"));
const MessageTicketHolders = lazy(() => import("./pages/Marketing/MessageTicketHolders"));
const ScheduledMessages = lazy(() => import("./pages/Marketing/ScheduledMessages"));
const MessageHistory = lazy(() => import("./pages/Marketing/MessageHistory"));
const MessageTemplates = lazy(() => import("./pages/Marketing/MessageTemplates"));

// Resale Section - lazy loaded
const ResaleSettings = lazy(() => import("./pages/Resale"));
const PriceRules = lazy(() => import("./pages/Resale/PriceRules"));
const RoyaltySettings = lazy(() => import("./pages/Resale/RoyaltySettings"));
const Marketplace = lazy(() => import("./pages/Resale/Marketplace"));
const ResaleAnalytics = lazy(() => import("./pages/Resale/ResaleAnalytics"));
const ResalePolicies = lazy(() => import("./pages/Resale/ResalePolicies"));

// Team Section - lazy loaded
const StaffList = lazy(() => import("./pages/Team"));
const StaffRoles = lazy(() => import("./pages/Team/StaffRoles"));
const AddStaffMember = lazy(() => import("./pages/Team/AddStaffMember"));
const StaffAssignments = lazy(() => import("./pages/Team/StaffAssignments"));
const SecurityCheckpoints = lazy(() => import("./pages/Team/SecurityCheckpoints"));
const StaffCheckIn = lazy(() => import("./pages/Team/StaffCheckIn"));
const StaffAnnouncements = lazy(() => import("./pages/Team/StaffAnnouncements"));
const StaffOnDuty = lazy(() => import("./pages/Team/StaffOnDuty"));
const InviteMember = lazy(() => import("./pages/Team/InviteMember"));
const MemberDetail = lazy(() => import("./pages/Team/MemberDetail"));
const EditPermissions = lazy(() => import("./pages/Team/EditPermissions"));
const TransferOwnership = lazy(() => import("./pages/Team/TransferOwnership"));
const AuditLog = lazy(() => import("./pages/Team/AuditLog"));
const TwoFactorSetup = lazy(() => import("./pages/Team/TwoFactorSetup"));

// Settings Section - lazy loaded
const SettingsIndex = lazy(() => import("./pages/Settings"));
const VenueProfile = lazy(() => import("./pages/Settings/VenueProfile"));
const VenueMedia = lazy(() => import("./pages/Settings/VenueMedia"));
const VenueSocial = lazy(() => import("./pages/Settings/VenueSocial"));
const VenueHours = lazy(() => import("./pages/Settings/VenueHours"));
const VenuePreview = lazy(() => import("./pages/Settings/VenuePreview"));
const VenueLocation = lazy(() => import("./pages/Settings/VenueLocation"));
const VenueParking = lazy(() => import("./pages/Settings/VenueParking"));
const VenueTransit = lazy(() => import("./pages/Settings/VenueTransit"));
const VenueLoadIn = lazy(() => import("./pages/Settings/VenueLoadIn"));
const VenueCurfew = lazy(() => import("./pages/Settings/VenueCurfew"));
const VenueAge = lazy(() => import("./pages/Settings/VenueAge"));
const EntryPoints = lazy(() => import("./pages/Settings/EntryPoints"));
const ExitPoints = lazy(() => import("./pages/Settings/ExitPoints"));
const ReEntryPolicy = lazy(() => import("./pages/Settings/ReEntryPolicy"));
const CapacitySettings = lazy(() => import("./pages/Settings/CapacitySettings"));
const SeatingConfigs = lazy(() => import("./pages/Settings/SeatingConfigs"));
const SeatingMapBuilder = lazy(() => import("./pages/Settings/SeatingMapBuilder"));
const SeatingSections = lazy(() => import("./pages/Settings/SeatingSections"));
const SeatingAccessibility = lazy(() => import("./pages/Settings/SeatingAccessibility"));
const SeatingPreview = lazy(() => import("./pages/Settings/SeatingPreview"));
const VIPAreas = lazy(() => import("./pages/Settings/VIPAreas"));
const VIPAccess = lazy(() => import("./pages/Settings/VIPAccess"));
const VIPAmenities = lazy(() => import("./pages/Settings/VIPAmenities"));
const VIPGuestLists = lazy(() => import("./pages/Settings/VIPGuestLists"));
const VIPWillCall = lazy(() => import("./pages/Settings/VIPWillCall"));
const VIPIDVerify = lazy(() => import("./pages/Settings/VIPIDVerify"));
const LegalTax = lazy(() => import("./pages/Settings/LegalTax"));
const LegalInsurance = lazy(() => import("./pages/Settings/LegalInsurance"));
const LegalLiquor = lazy(() => import("./pages/Settings/LegalLiquor"));
const LegalPayouts = lazy(() => import("./pages/Settings/LegalPayouts"));
const LegalVerification = lazy(() => import("./pages/Settings/LegalVerification"));
const LegalVerificationSubmit = lazy(() => import("./pages/Settings/LegalVerificationSubmit"));
const BrandingLogo = lazy(() => import("./pages/Settings/BrandingLogo"));
const BrandingTickets = lazy(() => import("./pages/Settings/BrandingTickets"));
const BrandingEmail = lazy(() => import("./pages/Settings/BrandingEmail"));
const BrandingPreview = lazy(() => import("./pages/Settings/BrandingPreview"));
const BrandingDomain = lazy(() => import("./pages/Settings/BrandingDomain"));
const CommEmailTemplates = lazy(() => import("./pages/Settings/CommEmailTemplates"));
const CommEmailCreate = lazy(() => import("./pages/Settings/CommEmailCreate"));
const CommEmailPreview = lazy(() => import("./pages/Settings/CommEmailPreview"));
const CommSMSTemplates = lazy(() => import("./pages/Settings/CommSMSTemplates"));
const CommSMSCreate = lazy(() => import("./pages/Settings/CommSMSCreate"));
const CommNotifications = lazy(() => import("./pages/Settings/CommNotifications"));
const PolicyRefund = lazy(() => import("./pages/Settings/PolicyRefund"));
const PolicyAge = lazy(() => import("./pages/Settings/PolicyAge"));
const PolicyBags = lazy(() => import("./pages/Settings/PolicyBags"));
const PolicyCustom = lazy(() => import("./pages/Settings/PolicyCustom"));
const PolicyCustomCreate = lazy(() => import("./pages/Settings/PolicyCustomCreate"));
const SafetyEmergency = lazy(() => import("./pages/Settings/SafetyEmergency"));
const SafetyEvacuation = lazy(() => import("./pages/Settings/SafetyEvacuation"));
const SafetyProtocols = lazy(() => import("./pages/Settings/SafetyProtocols"));
const SafetyMedical = lazy(() => import("./pages/Settings/SafetyMedical"));

// Operations Section - lazy loaded
const OperationsIndex = lazy(() => import("./pages/Operations"));
const IncidentsList = lazy(() => import("./pages/Operations/IncidentsList"));
const LogIncident = lazy(() => import("./pages/Operations/LogIncident"));
const IncidentDetail = lazy(() => import("./pages/Operations/IncidentDetail"));
const EquipmentList = lazy(() => import("./pages/Operations/EquipmentList"));
const AddEquipment = lazy(() => import("./pages/Operations/AddEquipment"));
const EquipmentCheck = lazy(() => import("./pages/Operations/EquipmentCheck"));

// Multi-Venue Section - lazy loaded
const VenuesList = lazy(() => import("./pages/Venues"));
const AddVenue = lazy(() => import("./pages/Venues/AddVenue"));
const CrossVenueAnalytics = lazy(() => import("./pages/Venues/CrossVenueAnalytics"));
const CompareVenues = lazy(() => import("./pages/Venues/CompareVenues"));

// Support Section - lazy loaded
const HelpCenter = lazy(() => import("./pages/Support"));
const SearchHelp = lazy(() => import("./pages/Support/SearchHelp"));
const HelpArticle = lazy(() => import("./pages/Support/HelpArticle"));
const TutorialVideos = lazy(() => import("./pages/Support/TutorialVideos"));
const GettingStarted = lazy(() => import("./pages/Support/GettingStarted"));
const BestPractices = lazy(() => import("./pages/Support/BestPractices"));
const ContactSupport = lazy(() => import("./pages/Support/ContactSupport"));
const LiveChat = lazy(() => import("./pages/Support/LiveChat"));
const ScheduleCall = lazy(() => import("./pages/Support/ScheduleCall"));
const EmergencyHotline = lazy(() => import("./pages/Support/EmergencyHotline"));
const AccountManager = lazy(() => import("./pages/Support/AccountManager"));
const RequestAccountManager = lazy(() => import("./pages/Support/RequestAccountManager"));
const TrainingSessions = lazy(() => import("./pages/Support/TrainingSessions"));
const TrainingMaterials = lazy(() => import("./pages/Support/TrainingMaterials"));
const Sandbox = lazy(() => import("./pages/Support/Sandbox"));
const BugReport = lazy(() => import("./pages/Support/BugReport"));
const FeatureRequest = lazy(() => import("./pages/Support/FeatureRequest"));
const VoteFeatures = lazy(() => import("./pages/Support/VoteFeatures"));
const SupportTickets = lazy(() => import("./pages/Support/SupportTickets"));
const TicketDetail = lazy(() => import("./pages/Support/TicketDetail"));
const LegalTerms = lazy(() => import("./pages/Support/LegalTerms"));
const LegalPrivacy = lazy(() => import("./pages/Support/LegalPrivacy"));
const LegalCompliance = lazy(() => import("./pages/Support/LegalCompliance"));
const TaxForms = lazy(() => import("./pages/Support/TaxForms"));
const PlatformAnnouncements = lazy(() => import("./pages/Support/PlatformAnnouncements"));
const PlatformStatus = lazy(() => import("./pages/Support/PlatformStatus"));
const SubscribeUpdates = lazy(() => import("./pages/Support/SubscribeUpdates"));

// Account Section - lazy loaded
const AccountSettings = lazy(() => import("./pages/Account"));
const EditProfile = lazy(() => import("./pages/Account/EditProfile"));
const ChangePassword = lazy(() => import("./pages/Account/ChangePassword"));
const Enable2FA = lazy(() => import("./pages/Account/Enable2FA"));
const NotificationPreferences = lazy(() => import("./pages/Account/NotificationPreferences"));

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

  // Event preview - no layout (wrapped in Suspense for lazy component)
  if (isEventPreviewPath(location.pathname)) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/venue/events/:id/preview" element={<EventPreview />} />
        </Routes>
      </Suspense>
    );
  }

  // Dashboard routes - with layout
  return (
    <DashboardLayout>
      <Suspense fallback={<PageLoader />}>
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
          <Route path="/venue/financials/payouts/failed" element={<FailedPayouts />} />
          <Route path="/venue/financials/settings" element={<PayoutSettings />} />
          <Route path="/venue/financials/refunds" element={<RefundsList />} />
          <Route path="/venue/financials/refunds/:id" element={<RefundDetail />} />
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
      </Suspense>
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

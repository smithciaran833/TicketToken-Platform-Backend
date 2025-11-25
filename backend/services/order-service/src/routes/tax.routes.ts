import { Router } from 'express';
import { TaxController } from '../controllers/tax.controller';

const router = Router();
const controller = new TaxController();

// Jurisdiction routes
router.post('/jurisdictions', (req, res) => controller.createJurisdiction(req as any, res));
router.get('/jurisdictions', (req, res) => controller.getJurisdictions(req as any, res));
router.patch('/jurisdictions/:jurisdictionId', (req, res) => controller.updateJurisdiction(req as any, res));

// Tax rate routes
router.post('/rates', (req, res) => controller.createTaxRate(req as any, res));
router.get('/rates', (req, res) => controller.getTaxRates(req as any, res));

// Tax category routes
router.post('/categories', (req, res) => controller.createCategory(req as any, res));
router.get('/categories', (req, res) => controller.getCategories(req as any, res));

// Tax exemption routes
router.post('/exemptions', (req, res) => controller.createExemption(req as any, res));
router.get('/exemptions/customer/:customerId', (req, res) => controller.getCustomerExemptions(req as any, res));
router.post('/exemptions/:exemptionId/verify', (req, res) => controller.verifyExemption(req as any, res));

// Tax calculation routes
router.post('/calculate', (req, res) => controller.calculateTax(req as any, res));
router.get('/orders/:orderId', (req, res) => controller.getTaxForOrder(req as any, res));

// Provider configuration routes
router.post('/provider/configure', (req, res) => controller.configureProvider(req as any, res));
router.get('/provider/config', (req, res) => controller.getProviderConfig(req as any, res));

// Tax reporting routes
router.post('/reports', (req, res) => controller.generateReport(req as any, res));
router.get('/reports', (req, res) => controller.getReports(req as any, res));
router.post('/reports/:reportId/file', (req, res) => controller.fileReport(req as any, res));
export default router;

import { Router } from 'express';
import { RefundPolicyController } from '../controllers/refund-policy.controller';

const router = Router();
const controller = new RefundPolicyController();

// Policy routes
router.post('/policies', (req, res) => controller.createPolicy(req as any, res));
router.get('/policies', (req, res) => controller.getPolicies(req as any, res));
router.get('/policies/:policyId', (req, res) => controller.getPolicy(req as any, res));
router.patch('/policies/:policyId', (req, res) => controller.updatePolicy(req as any, res));
router.delete('/policies/:policyId', (req, res) => controller.deactivatePolicy(req as any, res));

// Rule routes
router.post('/rules', (req, res) => controller.createRule(req as any, res));
router.get('/policies/:policyId/rules', (req, res) => controller.getRulesForPolicy(req as any, res));
router.get('/rules/:ruleId', (req, res) => controller.getRule(req as any, res));
router.patch('/rules/:ruleId', (req, res) => controller.updateRule(req as any, res));
router.delete('/rules/:ruleId/deactivate', (req, res) => controller.deactivateRule(req as any, res));
router.delete('/rules/:ruleId', (req, res) => controller.deleteRule(req as any, res));

// Reason routes
router.post('/reasons', (req, res) => controller.createReason(req as any, res));
router.get('/reasons', (req, res) => controller.getReasons(req as any, res));
router.get('/reasons/:reasonId', (req, res) => controller.getReason(req as any, res));
router.patch('/reasons/:reasonId', (req, res) => controller.updateReason(req as any, res));
router.delete('/reasons/:reasonId', (req, res) => controller.deactivateReason(req as any, res));

// Eligibility check
router.post('/check-eligibility', (req, res) => controller.checkEligibility(req as any, res));

export default router;

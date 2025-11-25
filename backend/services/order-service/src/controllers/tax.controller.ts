import { Request, Response } from 'express';
import { TaxCalculationService } from '../services/tax-calculation.service';
import { TaxManagementService } from '../services/tax-management.service';
import {
  createJurisdictionSchema,
  updateJurisdictionSchema,
  createTaxRateSchema,
  createCategorySchema,
  createExemptionSchema,
  calculateTaxSchema,
  configureProviderSchema,
  generateReportSchema,
  fileReportSchema
} from '../validators/tax.schemas';

interface AuthRequest extends Request {
  tenantId: string;
  userId: string;
}

export class TaxController {
  private calculationService: TaxCalculationService;
  private managementService: TaxManagementService;

  constructor() {
    this.calculationService = new TaxCalculationService();
    this.managementService = new TaxManagementService();
  }

  // Jurisdiction endpoints
  async createJurisdiction(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = createJurisdictionSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const jurisdiction = await this.managementService.createJurisdiction(req.tenantId, value);
      res.status(201).json(jurisdiction);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create jurisdiction' });
    }
  }

  async getJurisdictions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const activeOnly = req.query.active_only !== 'false';
      const jurisdictions = await this.managementService.getJurisdictions(req.tenantId, activeOnly);
      res.json(jurisdictions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve jurisdictions' });
    }
  }

  async updateJurisdiction(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = updateJurisdictionSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const jurisdiction = await this.managementService.updateJurisdiction(req.params.jurisdictionId, req.tenantId, value);
      if (!jurisdiction) {
        res.status(404).json({ error: 'Jurisdiction not found' });
        return;
      }

      res.json(jurisdiction);
    } catch (error) {
      res.status(500).json({ error: 'Failed to update jurisdiction' });
    }
  }

  // Tax rate endpoints
  async createTaxRate(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = createTaxRateSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const rate = await this.managementService.createTaxRate(req.tenantId, value);
      res.status(201).json(rate);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create tax rate' });
    }
  }

  async getTaxRates(req: AuthRequest, res: Response): Promise<void> {
    try {
      const jurisdictionId = req.query.jurisdiction_id as string | undefined;
      const rates = await this.managementService.getTaxRates(req.tenantId, jurisdictionId);
      res.json(rates);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve tax rates' });
    }
  }

  // Tax category endpoints
  async createCategory(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = createCategorySchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const category = await this.managementService.createTaxCategory(req.tenantId, value);
      res.status(201).json(category);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create category' });
    }
  }

  async getCategories(req: AuthRequest, res: Response): Promise<void> {
    try {
      const categories = await this.managementService.getTaxCategories(req.tenantId);
      res.json(categories);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve categories' });
    }
  }

  // Tax exemption endpoints
  async createExemption(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = createExemptionSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const exemption = await this.managementService.createTaxExemption(req.tenantId, value);
      res.status(201).json(exemption);
    } catch (error) {
      res.status(500).json({ error: 'Failed to create exemption' });
    }
  }

  async getCustomerExemptions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const exemptions = await this.managementService.getCustomerExemptions(req.tenantId, req.params.customerId);
      res.json(exemptions);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve exemptions' });
    }
  }

  async verifyExemption(req: AuthRequest, res: Response): Promise<void> {
    try {
      const exemption = await this.managementService.verifyExemption(req.params.exemptionId, req.tenantId, req.userId);
      if (!exemption) {
        res.status(404).json({ error: 'Exemption not found' });
        return;
      }

      res.json(exemption);
    } catch (error) {
      res.status(500).json({ error: 'Failed to verify exemption' });
    }
  }

  // Tax calculation endpoints
  async calculateTax(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = calculateTaxSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const calculation = await this.calculationService.calculateTax(req.tenantId, value);
      res.json(calculation);
    } catch (error) {
      res.status(500).json({ error: 'Failed to calculate tax' });
    }
  }

  async getTaxForOrder(req: AuthRequest, res: Response): Promise<void> {
    try {
      const calculation = await this.calculationService.getTaxCalculationForOrder(req.tenantId, req.params.orderId);
      if (!calculation) {
        res.status(404).json({ error: 'Tax calculation not found' });
        return;
      }

      const lineItems = await this.calculationService.getTaxLineItems(req.tenantId, calculation.id);
      res.json({ ...calculation, line_items: lineItems });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve tax calculation' });
    }
  }

  // Provider configuration endpoints
  async configureProvider(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = configureProviderSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const config = await this.managementService.configureTaxProvider(req.tenantId, value);
      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Failed to configure provider' });
    }
  }

  async getProviderConfig(req: AuthRequest, res: Response): Promise<void> {
    try {
      const config = await this.managementService.getTaxProviderConfig(req.tenantId);
      if (!config) {
        res.status(404).json({ error: 'No provider configured' });
        return;
      }

      res.json(config);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve provider config' });
    }
  }

  // Tax reporting endpoints
  async generateReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = generateReportSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const report = await this.managementService.generateTaxReport(req.tenantId, value);
      res.status(201).json(report);
    } catch (error) {
      res.status(500).json({ error: 'Failed to generate report' });
    }
  }

  async getReports(req: AuthRequest, res: Response): Promise<void> {
    try {
      const status = req.query.status as any;
      const reports = await this.managementService.getTaxReports(req.tenantId, status);
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve reports' });
    }
  }

  async fileReport(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { error, value } = fileReportSchema.validate(req.body);
      if (error) {
        res.status(400).json({ error: error.details[0].message });
        return;
      }

      const report = await this.managementService.fileTaxReport(
        req.params.reportId,
        req.tenantId,
        req.userId,
        value.filing_reference
      );

      if (!report) {
        res.status(404).json({ error: 'Report not found' });
        return;
      }

      res.json(report);
    } catch (error) {
      res.status(500).json({ error: 'Failed to file report' });
    }
  }
}

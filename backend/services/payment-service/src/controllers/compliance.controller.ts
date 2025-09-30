import { serviceCache } from '../services/cache-integration';
import { Request, Response, NextFunction } from 'express';
import { Form1099DAService } from '../services/compliance';
import { AuthRequest } from '../middleware/auth';

export class ComplianceController {
  private form1099DAService: Form1099DAService;
  
  constructor() {
    this.form1099DAService = new Form1099DAService();
  }
  
  async getTaxForm(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year } = req.params;
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const userId = req.user.id;
      
      const form = await this.form1099DAService.generateForm1099DA(
        userId,
        parseInt(year)
      );
      
      if (!form.required) {
        return res.json({
          required: false,
          message: 'Form 1099-DA not required for this tax year'
        });
      }
      
      res.json({
        required: true,
        form: form.formData,
        downloadUrl: `/api/compliance/tax-forms/1099-da/${userId}/${year}/download`
      });
    } catch (error) {
      return next(error);
    }
  }
  
  async downloadTaxForm(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year } = req.params;
      
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const userId = req.user.id;
      
      // Generate PDF (in production, use PDF library)
      const formData = await this.form1099DAService.generateForm1099DA(
        userId,
        parseInt(year)
      );
      
      if (!formData.required) {
        return res.status(404).json({
          error: 'No tax form available'
        });
      }
      
      // Set headers for PDF download
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="1099-DA_${year}_${userId}.pdf"`
      );
      
      // In production, generate actual PDF
      res.send('PDF content would be here');
    } catch (error) {
      return next(error);
    }
  }
  
  async getTaxSummary(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'Authentication required' });
      }
      
      const userId = req.user.id;
      const currentYear = new Date().getFullYear();
      
      const summary = {
        years: [] as any[]
      };
      
      // Check last 3 years
      for (let year = currentYear - 2; year <= currentYear; year++) {
        const status = await this.form1099DAService.getFormStatus(userId, year);
        summary.years.push({
          year,
          ...status
        });
      }
      
      res.json(summary);
    } catch (error) {
      return next(error);
    }
  }
}

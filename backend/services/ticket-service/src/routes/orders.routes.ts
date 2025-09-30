import { Router } from 'express';
import { ordersController } from '../controllers/orders.controller';

const router = Router();

// GET /ticket/orders/:orderId
router.get('/:orderId', ordersController.getOrderById.bind(ordersController));

export default router;

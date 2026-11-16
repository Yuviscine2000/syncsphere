import { Router } from 'express';
import {
  healthController,
  livenessController,
  readinessController,
} from './health.controller.js';

export const healthRouter = Router();

healthRouter.get('/', healthController);
healthRouter.get('/live', livenessController);
healthRouter.get('/ready', readinessController);

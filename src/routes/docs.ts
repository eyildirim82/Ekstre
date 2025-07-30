import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import YAML from 'yaml';
import swaggerUi from 'swagger-ui-express';

const router = Router();
const openapiPath = path.join(process.cwd(), 'openapi.yaml');
const openapiDoc = YAML.parse(fs.readFileSync(openapiPath, 'utf-8'));

router.use('/', swaggerUi.serve, swaggerUi.setup(openapiDoc));
export default router; 
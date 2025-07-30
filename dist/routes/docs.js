"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const yaml_1 = __importDefault(require("yaml"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const router = (0, express_1.Router)();
const openapiPath = path_1.default.join(process.cwd(), 'openapi.yaml');
const openapiDoc = yaml_1.default.parse(fs_1.default.readFileSync(openapiPath, 'utf-8'));
router.use('/', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openapiDoc));
exports.default = router;

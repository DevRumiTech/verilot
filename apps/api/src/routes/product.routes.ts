import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { createProductEvent } from "../controllers/custody-event.controller.js";
import { getProduct, listProducts } from "../controllers/product.controller.js";
import {
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
  requirePermission,
} from "../middleware/request-security.js";

export const productRouter = Router();

productRouter.get(
  API_PATHS.products,
  requireAuthentication,
  requirePermission(PERMISSIONS.productsRead),
  listProducts,
);

productRouter.get(
  `${API_PATHS.products}/:productId`,
  requireAuthentication,
  requirePermission(PERMISSIONS.productsRead),
  getProduct,
);

productRouter.post(
  `${API_PATHS.products}/:productId/events`,
  requireAllowedOrigin,
  requireAuthentication,
  requireCsrfToken,
  requirePermission(PERMISSIONS.productEventsWrite),
  createProductEvent,
);

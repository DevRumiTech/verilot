import { API_PATHS, PERMISSIONS } from "@verilot/contracts";
import { Router } from "express";

import { getProduct, listProducts } from "../controllers/product.controller.js";
import { requireAuthentication, requirePermission } from "../middleware/request-security.js";

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

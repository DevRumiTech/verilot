import { Router } from "express";

import { SYSTEM_PATHS } from "@verilot/contracts";

import { getHealth } from "../controllers/system.controller.js";

export const systemRouter = Router();

systemRouter.get(SYSTEM_PATHS.health, getHealth);

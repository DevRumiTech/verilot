import type { RequestHandler } from "express";

import { getHealthSnapshot } from "../services/system.service.js";

export const getHealth: RequestHandler = (_request, response) => {
  response.status(200).json({
    data: getHealthSnapshot(),
  });
};

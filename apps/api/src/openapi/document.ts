import {
  API_PATHS,
  APPLICATION_NAME,
  AUTH_COOKIE_NAME,
  CSRF_HEADER_NAME,
  SYSTEM_PATHS,
} from "@verilot/contracts";

const rateLimitHeaders = {
  "RateLimit-Limit": {
    description: "Maximum requests allowed in the current window.",
    schema: {
      type: "integer",
    },
  },
  "RateLimit-Policy": {
    description: "Request limit and window duration.",
    schema: {
      type: "string",
    },
  },
  "RateLimit-Remaining": {
    description: "Requests remaining in the current window.",
    schema: {
      type: "integer",
    },
  },
  "RateLimit-Reset": {
    description: "Seconds until the current window expires.",
    schema: {
      type: "integer",
    },
  },
} as const;

function errorResponse(description: string) {
  return {
    content: {
      "application/json": {
        schema: {
          $ref: "#/components/schemas/ErrorEnvelope",
        },
      },
    },
    description,
  };
}

export const openApiDocument = {
  openapi: "3.1.1",
  info: {
    description: "Product traceability, verification, access control, and organization data.",
    title: `${APPLICATION_NAME} API`,
    version: "0.1.0",
  },
  servers: [
    {
      description: "Current server",
      url: "/",
    },
  ],
  tags: [
    {
      description: "Service status.",
      name: "System",
    },
    {
      description: "Browser session operations.",
      name: "Authentication",
    },
    {
      description: "Organization batch records.",
      name: "Batches",
    },
    {
      description: "Organization product records and custody history.",
      name: "Products",
    },
    {
      description: "Organization user records.",
      name: "Users",
    },
    {
      description: "Public product verification.",
      name: "Verification",
    },
  ],
  paths: {
    [SYSTEM_PATHS.health]: {
      get: {
        operationId: "getHealth",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/HealthEnvelope",
                },
              },
            },
            description: "Service status returned.",
          },
        },
        summary: "Get service status",
        tags: ["System"],
      },
    },
    [API_PATHS.auth.login]: {
      post: {
        operationId: "signIn",
        parameters: [
          {
            description: "Trusted browser origin.",
            example: "http://127.0.0.1:5173",
            in: "header",
            name: "Origin",
            required: true,
            schema: {
              format: "uri",
              type: "string",
            },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/SignInRequest",
              },
            },
          },
          required: true,
        },
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuthSessionEnvelope",
                },
              },
            },
            description: "Browser session created.",
            headers: rateLimitHeaders,
          },
          "400": errorResponse("Invalid request."),
          "401": errorResponse("Email or password rejected."),
          "403": errorResponse("Origin rejected."),
          "429": {
            ...errorResponse("Request limit reached."),
            headers: {
              ...rateLimitHeaders,
              "Retry-After": {
                description: "Seconds before another request should be sent.",
                schema: {
                  type: "integer",
                },
              },
            },
          },
        },
        summary: "Sign in",
        tags: ["Authentication"],
      },
    },
    [API_PATHS.auth.session]: {
      get: {
        operationId: "getSession",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuthSessionEnvelope",
                },
              },
            },
            description: "Active session returned.",
          },
          "401": errorResponse("Authentication required."),
        },
        security: [
          {
            sessionCookie: [],
          },
        ],
        summary: "Get active session",
        tags: ["Authentication"],
      },
    },
    [API_PATHS.auth.logout]: {
      post: {
        operationId: "signOut",
        parameters: [
          {
            description: "Trusted browser origin.",
            example: "http://127.0.0.1:5173",
            in: "header",
            name: "Origin",
            required: true,
            schema: {
              format: "uri",
              type: "string",
            },
          },
        ],
        responses: {
          "204": {
            description: "Browser session revoked.",
          },
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Origin or CSRF token rejected."),
        },
        security: [
          {
            csrfHeader: [],
            sessionCookie: [],
          },
        ],
        summary: "Sign out",
        tags: ["Authentication"],
      },
    },
    [API_PATHS.batches]: {
      get: {
        operationId: "listBatches",
        parameters: [
          {
            in: "query",
            name: "page",
            schema: {
              default: 1,
              minimum: 1,
              type: "integer",
            },
          },
          {
            in: "query",
            name: "pageSize",
            schema: {
              default: 20,
              maximum: 100,
              minimum: 1,
              type: "integer",
            },
          },
          {
            in: "query",
            name: "search",
            schema: {
              maxLength: 100,
              type: "string",
            },
          },
          {
            in: "query",
            name: "status",
            schema: {
              enum: ["DRAFT", "ACTIVE", "RECALLED", "CLOSED"],
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BatchesEnvelope",
                },
              },
            },
            description: "Organization batches returned.",
          },
          "400": errorResponse("Query values rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Permission denied."),
        },
        security: [
          {
            sessionCookie: [],
          },
        ],
        summary: "List organization batches",
        tags: ["Batches"],
      },
    },
    [`${API_PATHS.batches}/{batchId}`]: {
      get: {
        operationId: "getBatch",
        parameters: [
          {
            in: "path",
            name: "batchId",
            required: true,
            schema: {
              format: "uuid",
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BatchEnvelope",
                },
              },
            },
            description: "Organization batch returned.",
          },
          "400": errorResponse("Batch identifier rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Permission denied."),
          "404": errorResponse("Batch not found."),
        },
        security: [
          {
            sessionCookie: [],
          },
        ],
        summary: "Get organization batch",
        tags: ["Batches"],
      },
    },
    [API_PATHS.products]: {
      get: {
        operationId: "listProducts",
        parameters: [
          {
            in: "query",
            name: "page",
            schema: {
              default: 1,
              minimum: 1,
              type: "integer",
            },
          },
          {
            in: "query",
            name: "pageSize",
            schema: {
              default: 20,
              maximum: 100,
              minimum: 1,
              type: "integer",
            },
          },
          {
            in: "query",
            name: "batchId",
            schema: {
              format: "uuid",
              type: "string",
            },
          },
          {
            in: "query",
            name: "search",
            schema: {
              maxLength: 100,
              type: "string",
            },
          },
          {
            in: "query",
            name: "status",
            schema: {
              enum: ["PENDING", "VERIFIED", "WARNING", "BLOCKED", "RECALLED", "DESTROYED"],
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProductsEnvelope",
                },
              },
            },
            description: "Organization products returned.",
          },
          "400": errorResponse("Query values rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Permission denied."),
        },
        security: [
          {
            sessionCookie: [],
          },
        ],
        summary: "List organization products",
        tags: ["Products"],
      },
    },
    [`${API_PATHS.products}/{productId}`]: {
      get: {
        operationId: "getProduct",
        parameters: [
          {
            in: "path",
            name: "productId",
            required: true,
            schema: {
              format: "uuid",
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProductEnvelope",
                },
              },
            },
            description: "Product and custody history returned.",
          },
          "400": errorResponse("Product identifier rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Permission denied."),
          "404": errorResponse("Product not found."),
        },
        security: [
          {
            sessionCookie: [],
          },
        ],
        summary: "Get organization product",
        tags: ["Products"],
      },
    },
    [API_PATHS.users]: {
      get: {
        operationId: "listUsers",
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/UsersEnvelope",
                },
              },
            },
            description: "Organization users returned.",
          },
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Permission denied."),
        },
        security: [
          {
            sessionCookie: [],
          },
        ],
        summary: "List organization users",
        tags: ["Users"],
      },
    },
    [`${API_PATHS.verification}/{serialNumber}`]: {
      get: {
        operationId: "verifyProduct",
        parameters: [
          {
            description: "VeriLot product serial number.",
            example: "VL-2026-000042",
            in: "path",
            name: "serialNumber",
            required: true,
            schema: {
              pattern: "^VL-\\d{4}-\\d{6}$",
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/VerificationEnvelope",
                },
              },
            },
            description: "Product verification returned.",
            headers: rateLimitHeaders,
          },
          "400": errorResponse("Serial number rejected."),
          "404": errorResponse("Product not found."),
          "429": {
            ...errorResponse("Request limit reached."),
            headers: {
              ...rateLimitHeaders,
              "Retry-After": {
                description: "Seconds before another request should be sent.",
                schema: {
                  type: "integer",
                },
              },
            },
          },
        },
        summary: "Verify a product",
        tags: ["Verification"],
      },
    },
  },
  components: {
    schemas: {
      ErrorEnvelope: {
        additionalProperties: false,
        properties: {
          error: {
            additionalProperties: false,
            properties: {
              code: {
                type: "string",
              },
              fieldErrors: {
                additionalProperties: {
                  items: {
                    type: "string",
                  },
                  type: "array",
                },
                type: "object",
              },
              message: {
                type: "string",
              },
              requestId: {
                type: "string",
              },
            },
            required: ["code", "fieldErrors", "message", "requestId"],
            type: "object",
          },
        },
        required: ["error"],
        type: "object",
      },
      HealthEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              apiVersion: {
                example: "v1",
                type: "string",
              },
              service: {
                const: "verilot-api",
                type: "string",
              },
              status: {
                const: "ok",
                type: "string",
              },
              timestamp: {
                format: "date-time",
                type: "string",
              },
              uptimeSeconds: {
                minimum: 0,
                type: "integer",
              },
            },
            required: ["apiVersion", "service", "status", "timestamp", "uptimeSeconds"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      SignInRequest: {
        additionalProperties: false,
        properties: {
          email: {
            example: "admin@verilot.local",
            format: "email",
            maxLength: 254,
            type: "string",
          },
          password: {
            example: "VeriLotAdmin2026!",
            maxLength: 128,
            minLength: 1,
            type: "string",
            writeOnly: true,
          },
        },
        required: ["email", "password"],
        type: "object",
      },
      OrganizationSummary: {
        additionalProperties: false,
        properties: {
          id: {
            format: "uuid",
            type: "string",
          },
          name: {
            type: "string",
          },
          type: {
            enum: ["MANUFACTURER", "LOGISTICS", "INSPECTOR", "RETAILER"],
            type: "string",
          },
        },
        required: ["id", "name", "type"],
        type: "object",
      },
      AuthenticatedUser: {
        additionalProperties: false,
        properties: {
          displayName: {
            type: "string",
          },
          email: {
            format: "email",
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
          organization: {
            $ref: "#/components/schemas/OrganizationSummary",
          },
          role: {
            enum: ["ADMINISTRATOR", "OPERATOR", "INSPECTOR"],
            type: "string",
          },
        },
        required: ["displayName", "email", "id", "organization", "role"],
        type: "object",
      },
      AuthSession: {
        additionalProperties: false,
        properties: {
          csrfToken: {
            type: "string",
          },
          expiresAt: {
            format: "date-time",
            type: "string",
          },
          user: {
            $ref: "#/components/schemas/AuthenticatedUser",
          },
        },
        required: ["csrfToken", "expiresAt", "user"],
        type: "object",
      },
      AuthSessionEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            $ref: "#/components/schemas/AuthSession",
          },
        },
        required: ["data"],
        type: "object",
      },
      BatchSummary: {
        additionalProperties: false,
        properties: {
          activatedAt: {
            oneOf: [
              {
                format: "date-time",
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          code: {
            type: "string",
          },
          expiresAt: {
            oneOf: [
              {
                format: "date",
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          id: {
            format: "uuid",
            type: "string",
          },
          lotNumber: {
            type: "string",
          },
          manufacturedAt: {
            format: "date",
            type: "string",
          },
          productCount: {
            minimum: 0,
            type: "integer",
          },
          productName: {
            type: "string",
          },
          recallCount: {
            minimum: 0,
            type: "integer",
          },
          serialEnd: {
            type: "integer",
          },
          serialPrefix: {
            type: "string",
          },
          serialStart: {
            type: "integer",
          },
          sku: {
            type: "string",
          },
          status: {
            enum: ["DRAFT", "ACTIVE", "RECALLED", "CLOSED"],
            type: "string",
          },
        },
        required: [
          "activatedAt",
          "code",
          "expiresAt",
          "id",
          "lotNumber",
          "manufacturedAt",
          "productCount",
          "productName",
          "recallCount",
          "serialEnd",
          "serialPrefix",
          "serialStart",
          "sku",
          "status",
        ],
        type: "object",
      },
      PaginationMetadata: {
        additionalProperties: false,
        properties: {
          page: {
            minimum: 1,
            type: "integer",
          },
          pageSize: {
            minimum: 1,
            type: "integer",
          },
          totalItems: {
            minimum: 0,
            type: "integer",
          },
          totalPages: {
            minimum: 0,
            type: "integer",
          },
        },
        required: ["page", "pageSize", "totalItems", "totalPages"],
        type: "object",
      },
      BatchesEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              batches: {
                items: {
                  $ref: "#/components/schemas/BatchSummary",
                },
                type: "array",
              },
              pagination: {
                $ref: "#/components/schemas/PaginationMetadata",
              },
            },
            required: ["batches", "pagination"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      BatchEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              batch: {
                $ref: "#/components/schemas/BatchSummary",
              },
            },
            required: ["batch"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      ProductBatchSummary: {
        additionalProperties: false,
        properties: {
          code: {
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
          lotNumber: {
            type: "string",
          },
          productName: {
            type: "string",
          },
          sku: {
            type: "string",
          },
          status: {
            enum: ["DRAFT", "ACTIVE", "RECALLED", "CLOSED"],
            type: "string",
          },
        },
        required: ["code", "id", "lotNumber", "productName", "sku", "status"],
        type: "object",
      },
      ProductSummary: {
        additionalProperties: false,
        properties: {
          activatedAt: {
            oneOf: [
              {
                format: "date-time",
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          batch: {
            $ref: "#/components/schemas/ProductBatchSummary",
          },
          blockedAt: {
            oneOf: [
              {
                format: "date-time",
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          blockReason: {
            oneOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          eventCount: {
            minimum: 0,
            type: "integer",
          },
          id: {
            format: "uuid",
            type: "string",
          },
          serialNumber: {
            type: "string",
          },
          status: {
            enum: ["PENDING", "VERIFIED", "WARNING", "BLOCKED", "RECALLED", "DESTROYED"],
            type: "string",
          },
          updatedAt: {
            format: "date-time",
            type: "string",
          },
        },
        required: [
          "activatedAt",
          "batch",
          "blockedAt",
          "blockReason",
          "eventCount",
          "id",
          "serialNumber",
          "status",
          "updatedAt",
        ],
        type: "object",
      },
      ProductCustodyEvent: {
        additionalProperties: false,
        properties: {
          actor: {
            oneOf: [
              {
                additionalProperties: false,
                properties: {
                  displayName: {
                    type: "string",
                  },
                },
                required: ["displayName"],
                type: "object",
              },
              {
                type: "null",
              },
            ],
          },
          eventAt: {
            format: "date-time",
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
          location: {
            oneOf: [
              {
                additionalProperties: false,
                properties: {
                  canton: {
                    type: "string",
                  },
                  countryCode: {
                    type: "string",
                  },
                  municipality: {
                    type: "string",
                  },
                  name: {
                    type: "string",
                  },
                },
                required: ["canton", "countryCode", "municipality", "name"],
                type: "object",
              },
              {
                type: "null",
              },
            ],
          },
          notes: {
            oneOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          organization: {
            additionalProperties: false,
            properties: {
              name: {
                type: "string",
              },
              type: {
                type: "string",
              },
            },
            required: ["name", "type"],
            type: "object",
          },
          recordedAt: {
            format: "date-time",
            type: "string",
          },
          shipmentReference: {
            oneOf: [
              {
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          transportMode: {
            oneOf: [
              {
                enum: ["AIR", "HAND_CARRIED", "RAIL", "ROAD", "SEA"],
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          type: {
            type: "string",
          },
        },
        required: [
          "actor",
          "eventAt",
          "id",
          "location",
          "notes",
          "organization",
          "recordedAt",
          "shipmentReference",
          "transportMode",
          "type",
        ],
        type: "object",
      },
      ProductDetail: {
        allOf: [
          {
            $ref: "#/components/schemas/ProductSummary",
          },
          {
            additionalProperties: false,
            properties: {
              custodyEvents: {
                items: {
                  $ref: "#/components/schemas/ProductCustodyEvent",
                },
                type: "array",
              },
            },
            required: ["custodyEvents"],
            type: "object",
          },
        ],
      },
      ProductsEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              pagination: {
                $ref: "#/components/schemas/PaginationMetadata",
              },
              products: {
                items: {
                  $ref: "#/components/schemas/ProductSummary",
                },
                type: "array",
              },
            },
            required: ["pagination", "products"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      ProductEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              product: {
                $ref: "#/components/schemas/ProductDetail",
              },
            },
            required: ["product"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      UserSummary: {
        additionalProperties: false,
        properties: {
          displayName: {
            type: "string",
          },
          email: {
            format: "email",
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
          organization: {
            $ref: "#/components/schemas/OrganizationSummary",
          },
          role: {
            enum: ["ADMINISTRATOR", "OPERATOR", "INSPECTOR"],
            type: "string",
          },
          status: {
            enum: ["ACTIVE", "SUSPENDED"],
            type: "string",
          },
        },
        required: ["displayName", "email", "id", "organization", "role", "status"],
        type: "object",
      },
      UsersEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              users: {
                items: {
                  $ref: "#/components/schemas/UserSummary",
                },
                type: "array",
              },
            },
            required: ["users"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      VerificationTimelineEntry: {
        additionalProperties: false,
        properties: {
          eventAt: {
            format: "date-time",
            type: "string",
          },
          location: {
            oneOf: [
              {
                additionalProperties: false,
                properties: {
                  canton: {
                    type: "string",
                  },
                  municipality: {
                    type: "string",
                  },
                },
                required: ["canton", "municipality"],
                type: "object",
              },
              {
                type: "null",
              },
            ],
          },
          organizationType: {
            type: "string",
          },
          type: {
            type: "string",
          },
        },
        required: ["eventAt", "location", "organizationType", "type"],
        type: "object",
      },
      PublicVerification: {
        additionalProperties: false,
        properties: {
          batch: {
            additionalProperties: false,
            properties: {
              code: {
                type: "string",
              },
              expiresAt: {
                oneOf: [
                  {
                    format: "date-time",
                    type: "string",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              lotNumber: {
                type: "string",
              },
              manufacturedAt: {
                format: "date-time",
                type: "string",
              },
              manufacturer: {
                type: "string",
              },
              productName: {
                type: "string",
              },
            },
            required: [
              "code",
              "expiresAt",
              "lotNumber",
              "manufacturedAt",
              "manufacturer",
              "productName",
            ],
            type: "object",
          },
          checkedAt: {
            format: "date-time",
            type: "string",
          },
          result: {
            enum: ["VERIFIED", "WARNING", "BLOCKED", "RECALLED"],
            type: "string",
          },
          serialNumber: {
            type: "string",
          },
          timeline: {
            items: {
              $ref: "#/components/schemas/VerificationTimelineEntry",
            },
            type: "array",
          },
        },
        required: ["batch", "checkedAt", "result", "serialNumber", "timeline"],
        type: "object",
      },
      VerificationEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            $ref: "#/components/schemas/PublicVerification",
          },
        },
        required: ["data"],
        type: "object",
      },
    },
    securitySchemes: {
      csrfHeader: {
        description: "CSRF token returned in the active session response.",
        in: "header",
        name: CSRF_HEADER_NAME,
        type: "apiKey",
      },
      sessionCookie: {
        description: "HTTP-only browser session cookie.",
        in: "cookie",
        name: AUTH_COOKIE_NAME,
        type: "apiKey",
      },
    },
  },
} as const;

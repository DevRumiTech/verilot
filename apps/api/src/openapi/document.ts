import {
  ALERT_RULES,
  ALERT_SEVERITIES,
  ALERT_STATUSES,
  API_PATHS,
  APPLICATION_NAME,
  AUTH_COOKIE_NAME,
  CSRF_HEADER_NAME,
  MAX_BATCH_PRODUCT_COUNT,
  PARTNER_API_KEY_HEADER_NAME,
  PARTNER_API_PATHS,
  RECALL_STATUSES,
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
      description: "Organization alert records.",
      name: "Alerts",
    },
    {
      description: "Organization recall records.",
      name: "Recalls",
    },
    {
      description: "Administrator-only organization audit history.",
      name: "Audit records",
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
      description: "Organization and global location records.",
      name: "Locations",
    },
    {
      description: "Organization user records.",
      name: "Users",
    },
    {
      description: "Public product verification.",
      name: "Verification",
    },
    {
      description: "API-key authenticated partner verification.",
      name: "Partner verification",
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
    [API_PATHS.alerts]: {
      get: {
        operationId: "listAlerts",
        parameters: [
          {
            in: "query",
            name: "page",
            schema: {
              default: 1,
              maximum: 10_000,
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
            name: "status",
            schema: {
              enum: ALERT_STATUSES,
              type: "string",
            },
          },
          {
            in: "query",
            name: "severity",
            schema: {
              enum: ALERT_SEVERITIES,
              type: "string",
            },
          },
          {
            in: "query",
            name: "rule",
            schema: {
              enum: ALERT_RULES,
              type: "string",
            },
          },
          {
            in: "query",
            name: "productId",
            schema: {
              format: "uuid",
              type: "string",
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
            name: "assignedToId",
            schema: {
              format: "uuid",
              type: "string",
            },
          },
          {
            description: "Match title, summary, product serial, batch code, or lot number.",
            in: "query",
            name: "search",
            schema: {
              maxLength: 100,
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AlertsEnvelope",
                },
              },
            },
            description: "Organization alerts returned.",
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
        summary: "List organization alerts",
        tags: ["Alerts"],
      },
    },
    [`${API_PATHS.alerts}/{alertId}`]: {
      get: {
        operationId: "getAlert",
        parameters: [
          {
            in: "path",
            name: "alertId",
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
                  $ref: "#/components/schemas/AlertEnvelope",
                },
              },
            },
            description: "Organization alert returned.",
          },
          "400": errorResponse("Alert identifier rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Permission denied."),
          "404": errorResponse("Alert not found."),
        },
        security: [
          {
            sessionCookie: [],
          },
        ],
        summary: "Get organization alert",
        tags: ["Alerts"],
      },
    },
    [`${API_PATHS.alerts}/{alertId}/assign`]: {
      post: {
        description:
          "Requires trusted browser origin, session authentication, CSRF validation, and alerts:manage permission.",
        operationId: "assignAlert",
        parameters: [
          {
            in: "path",
            name: "alertId",
            required: true,
            schema: {
              format: "uuid",
              type: "string",
            },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/AssignAlertRequest",
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
                  $ref: "#/components/schemas/AlertWorkflowEnvelope",
                },
              },
            },
            description: "Alert assignment or idempotent replay returned.",
          },
          "400": errorResponse("Request data rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Origin, CSRF token, or permission rejected."),
          "404": errorResponse("Alert or assignment target not found."),
          "409": errorResponse("Transition or idempotency conflict."),
        },
        security: [
          {
            csrfHeader: [],
            sessionCookie: [],
          },
        ],
        summary: "Assign an alert",
        tags: ["Alerts"],
      },
    },
    [`${API_PATHS.alerts}/{alertId}/resolve`]: {
      post: {
        description:
          "Requires trusted browser origin, session authentication, CSRF validation, and alerts:manage permission.",
        operationId: "resolveAlert",
        parameters: [
          {
            in: "path",
            name: "alertId",
            required: true,
            schema: {
              format: "uuid",
              type: "string",
            },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DecideAlertRequest",
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
                  $ref: "#/components/schemas/AlertWorkflowEnvelope",
                },
              },
            },
            description: "Alert resolution or idempotent replay returned.",
          },
          "400": errorResponse("Request data rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Origin, CSRF token, or permission rejected."),
          "404": errorResponse("Alert not found."),
          "409": errorResponse("Transition or idempotency conflict."),
        },
        security: [
          {
            csrfHeader: [],
            sessionCookie: [],
          },
        ],
        summary: "Resolve an alert",
        tags: ["Alerts"],
      },
    },
    [`${API_PATHS.alerts}/{alertId}/dismiss`]: {
      post: {
        description:
          "Requires trusted browser origin, session authentication, CSRF validation, and alerts:manage permission.",
        operationId: "dismissAlert",
        parameters: [
          {
            in: "path",
            name: "alertId",
            required: true,
            schema: {
              format: "uuid",
              type: "string",
            },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/DecideAlertRequest",
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
                  $ref: "#/components/schemas/AlertWorkflowEnvelope",
                },
              },
            },
            description: "Alert dismissal or idempotent replay returned.",
          },
          "400": errorResponse("Request data rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Origin, CSRF token, or permission rejected."),
          "404": errorResponse("Alert not found."),
          "409": errorResponse("Transition or idempotency conflict."),
        },
        security: [
          {
            csrfHeader: [],
            sessionCookie: [],
          },
        ],
        summary: "Dismiss an alert",
        tags: ["Alerts"],
      },
    },
    [API_PATHS.recalls]: {
      get: {
        operationId: "listRecalls",
        parameters: [
          {
            in: "query",
            name: "page",
            schema: {
              default: 1,
              maximum: 10_000,
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
            name: "status",
            schema: {
              enum: RECALL_STATUSES,
              type: "string",
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
            name: "announcedFrom",
            schema: {
              format: "date-time",
              type: "string",
            },
          },
          {
            in: "query",
            name: "announcedTo",
            schema: {
              format: "date-time",
              type: "string",
            },
          },
          {
            description: "Match recall reference, reason, or batch fields.",
            in: "query",
            name: "search",
            schema: {
              maxLength: 100,
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RecallsEnvelope",
                },
              },
            },
            description: "Organization recalls returned.",
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
        summary: "List organization recalls",
        tags: ["Recalls"],
      },
      post: {
        description:
          "Creates and immediately announces an active recall. Requires trusted browser origin, session authentication, CSRF validation, and recalls:manage permission.",
        operationId: "createRecall",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateRecallRequest",
              },
            },
          },
          required: true,
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/RecallWorkflowEnvelope",
                },
              },
            },
            description: "Recall creation or idempotent replay returned.",
          },
          "400": errorResponse("Request data rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Origin, CSRF token, or permission rejected."),
          "404": errorResponse("Batch not found."),
          "409": errorResponse("Transition, reference, or idempotency conflict."),
        },
        security: [
          {
            csrfHeader: [],
            sessionCookie: [],
          },
        ],
        summary: "Create and announce a recall",
        tags: ["Recalls"],
      },
    },
    [`${API_PATHS.recalls}/{recallId}`]: {
      get: {
        operationId: "getRecall",
        parameters: [
          {
            in: "path",
            name: "recallId",
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
                  $ref: "#/components/schemas/RecallEnvelope",
                },
              },
            },
            description: "Organization recall returned.",
          },
          "400": errorResponse("Recall identifier rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Permission denied."),
          "404": errorResponse("Recall not found."),
        },
        security: [
          {
            sessionCookie: [],
          },
        ],
        summary: "Get organization recall",
        tags: ["Recalls"],
      },
    },
    [`${API_PATHS.recalls}/{recallId}/complete`]: {
      post: {
        description:
          "Completes an active recall without removing recall, custody, or audit history. Requires trusted browser origin, session authentication, CSRF validation, and recalls:manage permission.",
        operationId: "completeRecall",
        parameters: [
          {
            in: "path",
            name: "recallId",
            required: true,
            schema: {
              format: "uuid",
              type: "string",
            },
          },
        ],
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CompleteRecallRequest",
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
                  $ref: "#/components/schemas/RecallWorkflowEnvelope",
                },
              },
            },
            description: "Recall completion or idempotent replay returned.",
          },
          "400": errorResponse("Request data rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Origin, CSRF token, or permission rejected."),
          "404": errorResponse("Recall not found."),
          "409": errorResponse("Transition or idempotency conflict."),
        },
        security: [
          {
            csrfHeader: [],
            sessionCookie: [],
          },
        ],
        summary: "Complete an active recall",
        tags: ["Recalls"],
      },
    },
    [API_PATHS.auditRecords]: {
      get: {
        description:
          "Requires the audit-records:read permission, which is assigned only to administrators.",
        operationId: "listAuditRecords",
        parameters: [
          {
            in: "query",
            name: "page",
            schema: {
              default: 1,
              maximum: 10_000,
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
            name: "action",
            schema: {
              maxLength: 100,
              minLength: 1,
              type: "string",
            },
          },
          {
            in: "query",
            name: "entityType",
            schema: {
              maxLength: 80,
              minLength: 1,
              type: "string",
            },
          },
          {
            in: "query",
            name: "entityId",
            schema: {
              maxLength: 100,
              minLength: 1,
              type: "string",
            },
          },
          {
            in: "query",
            name: "actorId",
            schema: {
              format: "uuid",
              type: "string",
            },
          },
          {
            in: "query",
            name: "requestId",
            schema: {
              maxLength: 100,
              minLength: 1,
              type: "string",
            },
          },
          {
            in: "query",
            name: "createdFrom",
            schema: {
              format: "date-time",
              type: "string",
            },
          },
          {
            in: "query",
            name: "createdTo",
            schema: {
              format: "date-time",
              type: "string",
            },
          },
          {
            description:
              "Match action, entity type, entity identifier, actor email, reason, or request identifier.",
            in: "query",
            name: "search",
            schema: {
              maxLength: 100,
              type: "string",
            },
          },
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/AuditRecordsEnvelope",
                },
              },
            },
            description: "Organization audit summaries returned.",
          },
          "400": errorResponse("Query values rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Administrator permission required."),
        },
        security: [
          {
            sessionCookie: [],
          },
        ],
        summary: "List organization audit records",
        tags: ["Audit records"],
      },
    },
    [`${API_PATHS.auditRecords}/{auditRecordId}`]: {
      get: {
        description:
          "Requires administrator permission. Sensitive keys in beforeData and afterData are recursively redacted in the response.",
        operationId: "getAuditRecord",
        parameters: [
          {
            in: "path",
            name: "auditRecordId",
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
                  $ref: "#/components/schemas/AuditRecordEnvelope",
                },
              },
            },
            description: "Organization audit record returned.",
          },
          "400": errorResponse("Audit record identifier rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Administrator permission required."),
          "404": errorResponse("Audit record not found."),
        },
        security: [
          {
            sessionCookie: [],
          },
        ],
        summary: "Get organization audit record",
        tags: ["Audit records"],
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
      post: {
        description:
          "Creates a draft batch. Serial ranges are limited to prevent excessive product generation during activation. Requires trusted browser origin, session authentication, CSRF validation, and batches:write permission.",
        operationId: "createBatch",
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/CreateBatchRequest",
              },
            },
          },
          required: true,
        },
        responses: {
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/BatchWorkflowEnvelope",
                },
              },
            },
            description: "Batch creation or idempotent replay returned.",
          },
          "400": errorResponse("Request data rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Origin, CSRF token, or permission rejected."),
          "409": errorResponse("Batch identity or idempotency conflict."),
        },
        security: [
          {
            csrfHeader: [],
            sessionCookie: [],
          },
        ],
        summary: "Create a draft batch",
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
    [`${API_PATHS.batches}/{batchId}/activate`]: {
      post: {
        description:
          "Activates a draft batch and atomically creates missing product identities for its configured serial range. Requires trusted browser origin, session authentication, CSRF validation, and batches:write permission.",
        operationId: "activateBatch",
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
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ChangeBatchStatusRequest",
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
                  $ref: "#/components/schemas/BatchWorkflowEnvelope",
                },
              },
            },
            description: "Batch activation or idempotent replay returned.",
          },
          "400": errorResponse("Request data rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Origin, CSRF token, or permission rejected."),
          "404": errorResponse("Batch not found."),
          "409": errorResponse("Transition, serial identity, or idempotency conflict."),
        },
        security: [
          {
            csrfHeader: [],
            sessionCookie: [],
          },
        ],
        summary: "Activate a draft batch",
        tags: ["Batches"],
      },
    },
    [`${API_PATHS.batches}/{batchId}/close`]: {
      post: {
        description:
          "Closes an active batch without removing its products or history. Requires trusted browser origin, session authentication, CSRF validation, and batches:write permission.",
        operationId: "closeBatch",
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
        requestBody: {
          content: {
            "application/json": {
              schema: {
                $ref: "#/components/schemas/ChangeBatchStatusRequest",
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
                  $ref: "#/components/schemas/BatchWorkflowEnvelope",
                },
              },
            },
            description: "Batch closure or idempotent replay returned.",
          },
          "400": errorResponse("Request data rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Origin, CSRF token, or permission rejected."),
          "404": errorResponse("Batch not found."),
          "409": errorResponse("Transition or idempotency conflict."),
        },
        security: [
          {
            csrfHeader: [],
            sessionCookie: [],
          },
        ],
        summary: "Close an active batch",
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
    [API_PATHS.locations]: {
      get: {
        operationId: "listLocations",
        parameters: [
          {
            in: "query",
            name: "canton",
            schema: {
              maxLength: 2,
              minLength: 2,
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
        ],
        responses: {
          "200": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/LocationsEnvelope",
                },
              },
            },
            description: "Locations returned.",
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
        summary: "List available locations",
        tags: ["Locations"],
      },
    },
    [`${API_PATHS.products}/{productId}/events`]: {
      post: {
        operationId: "createProductEvent",
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
        requestBody: {
          content: {
            "application/json": {
              schema: {
                additionalProperties: false,
                properties: {
                  correctedEventId: {
                    format: "uuid",
                    type: "string",
                  },
                  eventAt: {
                    format: "date-time",
                    type: "string",
                  },
                  idempotencyKey: {
                    maxLength: 120,
                    minLength: 8,
                    type: "string",
                  },
                  locationId: {
                    format: "uuid",
                    type: "string",
                  },
                  metadata: {
                    additionalProperties: {
                      type: ["boolean", "null", "number", "string"],
                    },
                    type: "object",
                  },
                  notes: {
                    maxLength: 1000,
                    type: "string",
                  },
                  shipmentReference: {
                    maxLength: 100,
                    type: "string",
                  },
                  transportMode: {
                    enum: ["AIR", "HAND_CARRIED", "RAIL", "ROAD", "WATER", "UNKNOWN"],
                    type: "string",
                  },
                  type: {
                    enum: [
                      "MANUFACTURED",
                      "PACKED",
                      "DISPATCHED",
                      "RECEIVED",
                      "INSPECTED",
                      "SOLD",
                      "RETURNED",
                      "BLOCKED",
                      "RELEASED",
                      "RECALLED",
                      "DESTROYED",
                      "CORRECTION",
                    ],
                    type: "string",
                  },
                },
                required: ["eventAt", "idempotencyKey", "type"],
                type: "object",
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
                  $ref: "#/components/schemas/ProductEventEnvelope",
                },
              },
            },
            description: "Earlier response returned.",
          },
          "201": {
            content: {
              "application/json": {
                schema: {
                  $ref: "#/components/schemas/ProductEventEnvelope",
                },
              },
            },
            description: "Custody event recorded.",
          },
          "400": errorResponse("Event data rejected."),
          "401": errorResponse("Authentication required."),
          "403": errorResponse("Permission denied."),
          "404": errorResponse("Referenced record not found."),
          "409": errorResponse("Event conflict."),
        },
        security: [
          {
            csrfHeader: [],
            sessionCookie: [],
          },
        ],
        summary: "Record a product custody event",
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
    [`${PARTNER_API_PATHS.verification}/{serialNumber}`]: {
      get: {
        description:
          "Returns the same redacted verification contract as the public endpoint using partner API-key authentication and a persistent client-specific rate limit.",
        operationId: "getPartnerVerification",
        parameters: [
          {
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
                  $ref: "#/components/schemas/PartnerVerificationEnvelope",
                },
              },
            },
            description: "Partner product verification returned.",
            headers: rateLimitHeaders,
          },
          "400": {
            ...errorResponse("Serial number rejected."),
            headers: rateLimitHeaders,
          },
          "401": errorResponse("Partner API key missing or invalid."),
          "404": {
            ...errorResponse("Product not found."),
            headers: rateLimitHeaders,
          },
          "429": {
            ...errorResponse("Partner request limit reached."),
            headers: {
              ...rateLimitHeaders,
              "Retry-After": {
                description: "Seconds until the request can be retried.",
                schema: {
                  type: "integer",
                },
              },
            },
          },
        },
        security: [
          {
            partnerApiKey: [],
          },
        ],
        summary: "Verify a product for a partner",
        tags: ["Partner verification"],
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
      AlertUserReference: {
        additionalProperties: false,
        properties: {
          displayName: {
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
        },
        required: ["displayName", "id"],
        type: "object",
      },
      AlertProductReference: {
        additionalProperties: false,
        properties: {
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
        },
        required: ["id", "serialNumber", "status"],
        type: "object",
      },
      AlertBatchReference: {
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
        },
        required: ["code", "id", "lotNumber", "productName", "sku"],
        type: "object",
      },
      AlertCustodyEventReference: {
        additionalProperties: false,
        properties: {
          eventAt: {
            format: "date-time",
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
          recordedAt: {
            format: "date-time",
            type: "string",
          },
          type: {
            enum: [
              "MANUFACTURED",
              "PACKED",
              "DISPATCHED",
              "RECEIVED",
              "INSPECTED",
              "SOLD",
              "RETURNED",
              "BLOCKED",
              "RELEASED",
              "RECALLED",
              "DESTROYED",
              "CORRECTION",
            ],
            type: "string",
          },
        },
        required: ["eventAt", "id", "recordedAt", "type"],
        type: "object",
      },
      AlertVerificationAttemptReference: {
        additionalProperties: false,
        properties: {
          attemptedAt: {
            format: "date-time",
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
          result: {
            enum: ["VERIFIED", "WARNING", "BLOCKED", "RECALLED", "UNKNOWN"],
            type: "string",
          },
          serialNumber: {
            type: "string",
          },
        },
        required: ["attemptedAt", "id", "result", "serialNumber"],
        type: "object",
      },
      AlertSummary: {
        additionalProperties: false,
        properties: {
          assignedTo: {
            oneOf: [
              {
                $ref: "#/components/schemas/AlertUserReference",
              },
              {
                type: "null",
              },
            ],
          },
          batch: {
            oneOf: [
              {
                $ref: "#/components/schemas/AlertBatchReference",
              },
              {
                type: "null",
              },
            ],
          },
          createdAt: {
            format: "date-time",
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
          product: {
            oneOf: [
              {
                $ref: "#/components/schemas/AlertProductReference",
              },
              {
                type: "null",
              },
            ],
          },
          rule: {
            enum: ALERT_RULES,
            type: "string",
          },
          severity: {
            enum: ALERT_SEVERITIES,
            type: "string",
          },
          status: {
            enum: ALERT_STATUSES,
            type: "string",
          },
          summary: {
            type: "string",
          },
          title: {
            type: "string",
          },
          updatedAt: {
            format: "date-time",
            type: "string",
          },
        },
        required: [
          "assignedTo",
          "batch",
          "createdAt",
          "id",
          "product",
          "rule",
          "severity",
          "status",
          "summary",
          "title",
          "updatedAt",
        ],
        type: "object",
      },
      AlertDetail: {
        allOf: [
          {
            $ref: "#/components/schemas/AlertSummary",
          },
          {
            additionalProperties: false,
            properties: {
              custodyEvent: {
                oneOf: [
                  {
                    $ref: "#/components/schemas/AlertCustodyEventReference",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              decisionAt: {
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
              details: {
                type: ["array", "boolean", "null", "number", "object", "string"],
              },
              evidenceRequest: {
                type: ["null", "string"],
              },
              resolvedBy: {
                oneOf: [
                  {
                    $ref: "#/components/schemas/AlertUserReference",
                  },
                  {
                    type: "null",
                  },
                ],
              },
              reviewNotes: {
                type: ["null", "string"],
              },
              verificationAttempt: {
                oneOf: [
                  {
                    $ref: "#/components/schemas/AlertVerificationAttemptReference",
                  },
                  {
                    type: "null",
                  },
                ],
              },
            },
            required: [
              "custodyEvent",
              "decisionAt",
              "details",
              "evidenceRequest",
              "resolvedBy",
              "reviewNotes",
              "verificationAttempt",
            ],
            type: "object",
          },
        ],
      },
      AssignAlertRequest: {
        additionalProperties: false,
        properties: {
          assignedToId: {
            format: "uuid",
            type: "string",
          },
          idempotencyKey: {
            maxLength: 120,
            minLength: 8,
            pattern: "^[A-Za-z0-9._:-]+$",
            type: "string",
          },
          reason: {
            maxLength: 1000,
            minLength: 1,
            type: "string",
          },
        },
        required: ["assignedToId", "idempotencyKey"],
        type: "object",
      },
      DecideAlertRequest: {
        additionalProperties: false,
        properties: {
          idempotencyKey: {
            maxLength: 120,
            minLength: 8,
            pattern: "^[A-Za-z0-9._:-]+$",
            type: "string",
          },
          reviewNotes: {
            maxLength: 2000,
            minLength: 1,
            type: "string",
          },
        },
        required: ["idempotencyKey", "reviewNotes"],
        type: "object",
      },
      AlertWorkflowState: {
        additionalProperties: false,
        properties: {
          assignedTo: {
            oneOf: [
              {
                $ref: "#/components/schemas/AlertUserReference",
              },
              {
                type: "null",
              },
            ],
          },
          decisionAt: {
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
          id: {
            format: "uuid",
            type: "string",
          },
          resolvedBy: {
            oneOf: [
              {
                $ref: "#/components/schemas/AlertUserReference",
              },
              {
                type: "null",
              },
            ],
          },
          reviewNotes: {
            type: ["null", "string"],
          },
          status: {
            enum: ALERT_STATUSES,
            type: "string",
          },
          updatedAt: {
            format: "date-time",
            type: "string",
          },
        },
        required: [
          "assignedTo",
          "decisionAt",
          "id",
          "resolvedBy",
          "reviewNotes",
          "status",
          "updatedAt",
        ],
        type: "object",
      },
      AlertWorkflowEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              alert: {
                $ref: "#/components/schemas/AlertWorkflowState",
              },
              replayed: {
                type: "boolean",
              },
            },
            required: ["alert", "replayed"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      AlertsEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              alerts: {
                items: {
                  $ref: "#/components/schemas/AlertSummary",
                },
                type: "array",
              },
              pagination: {
                $ref: "#/components/schemas/PaginationMetadata",
              },
            },
            required: ["alerts", "pagination"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      AlertEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              alert: {
                $ref: "#/components/schemas/AlertDetail",
              },
            },
            required: ["alert"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      AuditActorReference: {
        additionalProperties: false,
        properties: {
          displayName: {
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
        },
        required: ["displayName", "id"],
        type: "object",
      },
      AuditRecordSummary: {
        additionalProperties: false,
        properties: {
          action: {
            type: "string",
          },
          actor: {
            oneOf: [
              {
                $ref: "#/components/schemas/AuditActorReference",
              },
              {
                type: "null",
              },
            ],
          },
          actorEmail: {
            type: ["null", "string"],
          },
          actorRole: {
            oneOf: [
              {
                enum: ["ADMINISTRATOR", "OPERATOR", "INSPECTOR"],
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          createdAt: {
            format: "date-time",
            type: "string",
          },
          entityId: {
            type: "string",
          },
          entityType: {
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
          reason: {
            type: ["null", "string"],
          },
          requestId: {
            type: "string",
          },
        },
        required: [
          "action",
          "actor",
          "actorEmail",
          "actorRole",
          "createdAt",
          "entityId",
          "entityType",
          "id",
          "reason",
          "requestId",
        ],
        type: "object",
      },
      AuditRecordDetail: {
        allOf: [
          {
            $ref: "#/components/schemas/AuditRecordSummary",
          },
          {
            additionalProperties: false,
            properties: {
              afterData: {
                type: ["array", "boolean", "null", "number", "object", "string"],
              },
              beforeData: {
                type: ["array", "boolean", "null", "number", "object", "string"],
              },
            },
            required: ["afterData", "beforeData"],
            type: "object",
          },
        ],
      },
      AuditRecordsEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              auditRecords: {
                items: {
                  $ref: "#/components/schemas/AuditRecordSummary",
                },
                type: "array",
              },
              pagination: {
                $ref: "#/components/schemas/PaginationMetadata",
              },
            },
            required: ["auditRecords", "pagination"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      AuditRecordEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              auditRecord: {
                $ref: "#/components/schemas/AuditRecordDetail",
              },
            },
            required: ["auditRecord"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      RecallBatchReference: {
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
      RecallUserReference: {
        additionalProperties: false,
        properties: {
          displayName: {
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
        },
        required: ["displayName", "id"],
        type: "object",
      },
      CreateRecallRequest: {
        additionalProperties: false,
        properties: {
          batchId: {
            format: "uuid",
            type: "string",
          },
          idempotencyKey: {
            maxLength: 120,
            minLength: 8,
            pattern: "^[A-Za-z0-9._:-]+$",
            type: "string",
          },
          reason: {
            maxLength: 1000,
            minLength: 1,
            type: "string",
          },
          reference: {
            maxLength: 60,
            minLength: 1,
            type: "string",
          },
        },
        required: ["batchId", "idempotencyKey", "reason", "reference"],
        type: "object",
      },
      CompleteRecallRequest: {
        additionalProperties: false,
        properties: {
          idempotencyKey: {
            maxLength: 120,
            minLength: 8,
            pattern: "^[A-Za-z0-9._:-]+$",
            type: "string",
          },
        },
        required: ["idempotencyKey"],
        type: "object",
      },
      RecallWorkflowState: {
        additionalProperties: false,
        properties: {
          announcedAt: {
            format: "date-time",
            type: "string",
          },
          batchId: {
            format: "uuid",
            type: "string",
          },
          completedAt: {
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
          id: {
            format: "uuid",
            type: "string",
          },
          reference: {
            type: "string",
          },
          status: {
            enum: RECALL_STATUSES,
            type: "string",
          },
        },
        required: ["announcedAt", "batchId", "completedAt", "id", "reference", "status"],
        type: "object",
      },
      RecallWorkflowEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              recall: {
                $ref: "#/components/schemas/RecallWorkflowState",
              },
              replayed: {
                type: "boolean",
              },
            },
            required: ["recall", "replayed"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      RecallSummary: {
        additionalProperties: false,
        properties: {
          announcedAt: {
            format: "date-time",
            type: "string",
          },
          batch: {
            $ref: "#/components/schemas/RecallBatchReference",
          },
          completedAt: {
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
          id: {
            format: "uuid",
            type: "string",
          },
          reason: {
            type: "string",
          },
          reference: {
            type: "string",
          },
          status: {
            enum: RECALL_STATUSES,
            type: "string",
          },
        },
        required: ["announcedAt", "batch", "completedAt", "id", "reason", "reference", "status"],
        type: "object",
      },
      RecallDetail: {
        allOf: [
          {
            $ref: "#/components/schemas/RecallSummary",
          },
          {
            additionalProperties: false,
            properties: {
              createdBy: {
                $ref: "#/components/schemas/RecallUserReference",
              },
              custodyEventCount: {
                minimum: 0,
                type: "integer",
              },
              productCount: {
                minimum: 0,
                type: "integer",
              },
            },
            required: ["createdBy", "custodyEventCount", "productCount"],
            type: "object",
          },
        ],
      },
      RecallsEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              pagination: {
                $ref: "#/components/schemas/PaginationMetadata",
              },
              recalls: {
                items: {
                  $ref: "#/components/schemas/RecallSummary",
                },
                type: "array",
              },
            },
            required: ["pagination", "recalls"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      RecallEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              recall: {
                $ref: "#/components/schemas/RecallDetail",
              },
            },
            required: ["recall"],
            type: "object",
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
      CreateBatchRequest: {
        additionalProperties: false,
        properties: {
          code: {
            maxLength: 50,
            minLength: 1,
            type: "string",
          },
          expiresAt: {
            format: "date",
            type: "string",
          },
          idempotencyKey: {
            maxLength: 120,
            minLength: 8,
            pattern: "^[A-Za-z0-9._:-]+$",
            type: "string",
          },
          lotNumber: {
            maxLength: 80,
            minLength: 1,
            type: "string",
          },
          manufacturedAt: {
            format: "date",
            type: "string",
          },
          productName: {
            maxLength: 160,
            minLength: 1,
            type: "string",
          },
          serialEnd: {
            description: `Must produce no more than ${MAX_BATCH_PRODUCT_COUNT} identities when combined with serialStart.`,
            maximum: 999_999,
            minimum: 1,
            type: "integer",
          },
          serialPrefix: {
            maxLength: 24,
            minLength: 1,
            pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$",
            type: "string",
          },
          serialStart: {
            maximum: 999_999,
            minimum: 1,
            type: "integer",
          },
          sku: {
            maxLength: 80,
            minLength: 1,
            type: "string",
          },
        },
        required: [
          "code",
          "idempotencyKey",
          "lotNumber",
          "manufacturedAt",
          "productName",
          "serialEnd",
          "serialPrefix",
          "serialStart",
          "sku",
        ],
        type: "object",
      },
      ChangeBatchStatusRequest: {
        additionalProperties: false,
        properties: {
          idempotencyKey: {
            maxLength: 120,
            minLength: 8,
            pattern: "^[A-Za-z0-9._:-]+$",
            type: "string",
          },
        },
        required: ["idempotencyKey"],
        type: "object",
      },
      BatchWorkflowState: {
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
          "serialEnd",
          "serialPrefix",
          "serialStart",
          "sku",
          "status",
        ],
        type: "object",
      },
      BatchWorkflowEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              batch: {
                $ref: "#/components/schemas/BatchWorkflowState",
              },
              replayed: {
                type: "boolean",
              },
            },
            required: ["batch", "replayed"],
            type: "object",
          },
        },
        required: ["data"],
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
                enum: ["AIR", "HAND_CARRIED", "RAIL", "ROAD", "WATER", "UNKNOWN"],
                type: "string",
              },
              {
                type: "null",
              },
            ],
          },
          type: {
            enum: [
              "MANUFACTURED",
              "PACKED",
              "DISPATCHED",
              "RECEIVED",
              "INSPECTED",
              "SOLD",
              "RETURNED",
              "BLOCKED",
              "RELEASED",
              "RECALLED",
              "DESTROYED",
              "CORRECTION",
            ],
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
      LocationSummary: {
        additionalProperties: false,
        properties: {
          canton: {
            type: "string",
          },
          code: {
            type: "string",
          },
          countryCode: {
            type: "string",
          },
          id: {
            format: "uuid",
            type: "string",
          },
          isGlobal: {
            type: "boolean",
          },
          latitude: {
            type: "number",
          },
          longitude: {
            type: "number",
          },
          municipality: {
            type: "string",
          },
          name: {
            type: "string",
          },
        },
        required: [
          "canton",
          "code",
          "countryCode",
          "id",
          "isGlobal",
          "latitude",
          "longitude",
          "municipality",
          "name",
        ],
        type: "object",
      },
      LocationsEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            additionalProperties: false,
            properties: {
              locations: {
                items: {
                  $ref: "#/components/schemas/LocationSummary",
                },
                type: "array",
              },
            },
            required: ["locations"],
            type: "object",
          },
        },
        required: ["data"],
        type: "object",
      },
      ProductEventMutation: {
        additionalProperties: false,
        properties: {
          event: {
            $ref: "#/components/schemas/ProductCustodyEvent",
          },
          productStatus: {
            enum: ["PENDING", "VERIFIED", "WARNING", "BLOCKED", "RECALLED", "DESTROYED"],
            type: "string",
          },
          replayed: {
            type: "boolean",
          },
        },
        required: ["event", "productStatus", "replayed"],
        type: "object",
      },
      ProductEventEnvelope: {
        additionalProperties: false,
        properties: {
          data: {
            $ref: "#/components/schemas/ProductEventMutation",
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
      PartnerVerificationEnvelope: {
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
      partnerApiKey: {
        description: "Partner API key. Raw keys are never persisted or logged.",
        in: "header",
        name: PARTNER_API_KEY_HEADER_NAME,
        type: "apiKey",
      },
    },
  },
} as const;

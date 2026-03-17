export class McpError extends Error {
  constructor(
    public rpcCode: number,
    message: string,
    public httpStatus: number = 500,
  ) {
    super(message);
  }
}

export class McpForbiddenError extends McpError {
  constructor() {
    super(-32003, 'Forbidden', 403);
  }
}

export class McpDraftNotFoundError extends McpError {
  constructor() {
    super(-32004, 'Draft not found', 404);
  }
}

export class McpUnknownToolError extends McpError {
  constructor() {
    super(-32601, 'Method not found', 404);
  }
}

export class McpInvalidToolCallError extends McpError {
  constructor() {
    super(-32602, 'Invalid params', 400);
  }
}

export class McpInvalidToolArgumentsError extends McpError {
  constructor(detail: string) {
    super(-32602, `Invalid tool arguments: ${detail}`, 400);
  }
}

export class McpNoEditorConnectedError extends McpError {
  constructor() {
    super(
      -32005,
      'No editor connected. Open the draft in the Draftila editor to use this tool.',
      409,
    );
  }
}

export class McpRpcTimeoutError extends McpError {
  constructor() {
    super(-32006, 'Editor did not respond in time. Please try again.', 504);
  }
}

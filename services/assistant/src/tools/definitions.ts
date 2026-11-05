/**
 * Tool definitions in OpenAI function-tool format, sent to OpenRouter.
 * Requirement 11.10
 *
 * The model never supplies a user id: every tool runs for the user who made the
 * authenticated request, so identity is bound on the server.
 */

export const toolDefinitions = [
  {
    type: 'function' as const,
    function: {
      name: 'get_catalog',
      description:
        'List exercises from the catalog. Use filters to respect the user\'s fitness level and injuries. Returns exercise ids, groups, levels and injury conflicts.',
      parameters: {
        type: 'object',
        properties: {
          group: {
            type: 'string',
            enum: ['warm_up', 'lower_body', 'upper_body', 'core', 'cardio'],
            description: 'Only return exercises in this group.',
          },
          max_level: {
            type: 'integer',
            minimum: 1,
            maximum: 3,
            description: 'Only return exercises at or below this difficulty level.',
          },
          exclude_injuries: {
            type: 'array',
            items: { type: 'string' },
            description: 'Injury identifiers (snake_case) to exclude, e.g. "knee_injury".',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_profile',
      description:
        'Get the current user\'s fitness profile: age range, weight, goal, fitness level, injuries and minutes per day.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_recent_logs',
      description: 'Get the current user\'s most recent completed workout logs, newest first.',
      parameters: {
        type: 'object',
        properties: {
          limit: {
            type: 'integer',
            minimum: 1,
            maximum: 20,
            description: 'How many logs to return.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'validate_plan',
      description:
        'Check a workout plan against the schema, the exercise catalog and the rules. Returns success or a list of errors with JSON paths. Call this before save_plan.',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'object', description: 'The complete workout plan JSON.' },
        },
        required: ['plan'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'save_plan',
      description:
        'Save a validated workout plan as the user\'s active plan. The plan is validated again before saving; invalid plans are rejected.',
      parameters: {
        type: 'object',
        properties: {
          plan: { type: 'object', description: 'The complete workout plan JSON.' },
        },
        required: ['plan'],
      },
    },
  },
];

/**
 * Tool definition tests (OpenAI tool format)
 * Requirement: 11.10
 */

import { describe, it, expect } from 'vitest';
import { toolDefinitions } from '../src/tools/definitions';

type ToolDef = (typeof toolDefinitions)[number];
const byName = (name: string): ToolDef => {
  const found = toolDefinitions.find((t) => t.function.name === name);
  if (!found) throw new Error(`missing tool ${name}`);
  return found;
};

describe('toolDefinitions', () => {
  it('exposes the six assistant tools', () => {
    expect(toolDefinitions.map((t) => t.function.name).sort()).toEqual(
      ['get_catalog', 'get_health_summary', 'get_profile', 'get_recent_logs', 'save_plan', 'validate_plan'],
    );
  });

  it('describes get_health_summary as optional data with no inputs', () => {
    const tool = byName('get_health_summary').function;
    expect(tool.parameters).toMatchObject({ type: 'object', properties: {}, required: [] });
    expect(tool.description).toMatch(/null/i);
  });

  it('uses the OpenAI function-tool shape with descriptions and object parameters', () => {
    for (const tool of toolDefinitions) {
      expect(tool.type).toBe('function');
      expect(tool.function.description.length).toBeGreaterThan(10);
      expect(tool.function.parameters).toMatchObject({ type: 'object' });
    }
  });

  it('requires the plan for validate_plan and save_plan', () => {
    expect(byName('validate_plan').function.parameters).toMatchObject({ required: ['plan'] });
    expect(byName('save_plan').function.parameters).toMatchObject({ required: ['plan'] });
  });

  it('bounds get_catalog and get_recent_logs inputs', () => {
    const catalog = byName('get_catalog').function.parameters as any;
    expect(catalog.properties.max_level).toMatchObject({ type: 'integer', minimum: 1, maximum: 3 });
    expect(catalog.properties.exclude_injuries).toMatchObject({ type: 'array' });

    const logs = byName('get_recent_logs').function.parameters as any;
    expect(logs.properties.limit).toMatchObject({ type: 'integer', minimum: 1 });
  });

  it('never lets the model choose the user id (identity comes from the authenticated request)', () => {
    for (const tool of toolDefinitions) {
      const props = Object.keys((tool.function.parameters as any).properties ?? {});
      expect(props).not.toContain('user_id');
      expect(props).not.toContain('userId');
    }
  });
});
